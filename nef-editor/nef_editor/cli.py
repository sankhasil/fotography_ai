"""Command line entrypoint.

Parses arguments, sequences the components, prints a summary. Contains no
business logic — that lives in pipeline.py.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from nef_editor.model import ASSIGNABLE_CATEGORIES, SUB_STYLES, Category, SubStyle
from nef_editor.pipeline import Options, run


class _Parser(argparse.ArgumentParser):
    """argparse exits 2 with its own message; we want our own wording."""

    def error(self, message: str) -> None:  # type: ignore[override]
        self.exit(2, f"error: {message}\n")


def _choices(name: str, values: tuple[str, ...]) -> str:
    return ", ".join(values)


def build_parser() -> argparse.ArgumentParser:
    parser = _Parser(
        prog="nef-editor",
        description=(
            "Classify Nikon .nef photographs and write XMP sidecars next to them "
            "so darktable's GUI loads the matching preset. Originals are never modified."
        ),
        epilog=(
            "Only 'night' is detected automatically (ISO >= 3200). Assign any "
            "other category with --category.\n"
            f"categories: {_choices('category', ASSIGNABLE_CATEGORIES)}\n"
            f"sub-styles: {_choices('sub-style', SUB_STYLES)}\n"
            "\nSubcommands:\n"
            "  convert-nksc <folder>  Convert darktable .xmp sidecars to NX Studio .nksc files\n"
            "  apply-nksc <root>      Generate NX Studio .nksc sidecars per category subfolder\n"
            "  organize <folder>      Move NEFs+XMPs into category subfolders using the DB"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command")

    # Default subcommand: classify (no name — invoked when no subcommand given)
    classify = sub.add_parser("classify", help="classify and write XMP sidecars (default)")
    classify.add_argument("folder", help="folder containing .nef files")
    classify.add_argument("--category", choices=ASSIGNABLE_CATEGORIES)
    classify.add_argument("--only-unclassified", action="store_true")
    classify.add_argument("--sub-style", choices=SUB_STYLES, default=SubStyle.NEUTRAL.value)
    classify.add_argument("--recursive", action="store_true")
    classify.add_argument("--dry-run", action="store_true")
    classify.add_argument("--force", action="store_true")
    classify.add_argument("--db")
    classify.add_argument("--no-sidecars", action="store_true",
                          help="skip XMP sidecar writing (classification + DB only)")

    # Subcommand: convert-nksc
    nksc_parser = sub.add_parser("convert-nksc", help="Convert darktable XMP sidecars to NX Studio .nksc files")
    nksc_parser.add_argument("folder", help="folder containing .nef + .xmp files")
    nksc_parser.add_argument("--recursive", action="store_true", help="descend into subfolders")
    nksc_parser.add_argument("--dry-run", action="store_true", help="show what would be converted, write nothing")

    # Subcommand: organize
    org_parser = sub.add_parser("organize", help="Move NEFs+XMPs into category subfolders using the DB")
    org_parser.add_argument("folder", help="folder with .nef-editor/state.db")
    org_parser.add_argument("--dry-run", action="store_true", help="show what would move, move nothing")

    # Subcommand: apply-nksc
    apply_parser = sub.add_parser(
        "apply-nksc",
        help="Generate NX Studio .nksc sidecars per category subfolder using per-category presets",
    )
    apply_parser.add_argument("root", help="root folder containing category subfolders (e.g. Travemunde Strand Dracen)")
    apply_parser.add_argument("--dry-run", action="store_true", help="show what would be written, write nothing")

    return parser


def main(argv: list[str] | None = None) -> int:
    # If no subcommand given, insert "classify" as default
    if argv is None:
        argv = list(sys.argv[1:])
    if argv and argv[0] not in ("convert-nksc", "apply-nksc", "organize", "-h", "--help"):
        argv = ["classify"] + argv
    elif not argv:
        argv = ["classify"]

    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code or 0)

    if args.command == "convert-nksc":
        return _cmd_convert_nksc(args)
    elif args.command == "apply-nksc":
        return _cmd_apply_nksc(args)
    elif args.command == "organize":
        return _cmd_organize(args)
    elif args.command == "classify":
        return _cmd_classify(args)

    parser.print_help()
    return 2


def _cmd_classify(args: argparse.Namespace) -> int:
    source = Path(args.folder).expanduser()
    if not source.is_dir():
        print(f"error: not a folder: {source}", file=sys.stderr)
        return 2

    opts = Options(
        source=source,
        category=Category(args.category) if args.category else None,
        sub_style=SubStyle(args.sub_style),
        recursive=args.recursive,
        dry_run=args.dry_run,
        force=args.force,
        db=Path(args.db).expanduser() if args.db else None,
        only_unclassified=args.only_unclassified,
        no_sidecars=args.no_sidecars,
    )

    try:
        result = run(opts)
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130

    print(result.summary())
    for line in result.errors[:10]:
        print(f"  {line}", file=sys.stderr)
    if len(result.errors) > 10:
        print(f"  ... and {len(result.errors) - 10} more", file=sys.stderr)

    return 1 if result.failed else 0


def _cmd_convert_nksc(args: argparse.Namespace) -> int:
    from nef_editor.nksc import convert_folder

    source = Path(args.folder).expanduser()
    if not source.is_dir():
        print(f"error: not a folder: {source}", file=sys.stderr)
        return 2

    if args.recursive:
        all_dirs = [d for d in source.rglob("*") if d.is_dir()]
        all_dirs.append(source)
    else:
        all_dirs = [source]

    total = {"converted": 0, "skipped": 0, "errors": 0}
    for d in all_dirs:
        counts = convert_folder(d, dry_run=args.dry_run)
        for k in total:
            total[k] += counts[k]

    action = "would convert" if args.dry_run else "converted"
    print(f"{action} {total['converted']}, skipped {total['skipped']}, errors {total['errors']}")
    return 1 if total["errors"] else 0


def _cmd_apply_nksc(args: argparse.Namespace) -> int:
    from nef_editor.model import Category
    from nef_editor.nksc import apply_preset_to_folder

    root = Path(args.root).expanduser()
    if not root.is_dir():
        print(f"error: not a folder: {root}", file=sys.stderr)
        return 2

    # ponytail: iterate child folders whose name is a known category. A category
    # folder is identified by name (matches Category enum value). The macro
    # folder must exist because it holds the master template.
    category_folders: list[tuple[Category, Path]] = []
    for sub in sorted(p for p in root.iterdir() if p.is_dir()):
        try:
            cat = Category(sub.name)
        except ValueError:
            continue
        category_folders.append((cat, sub))

    if not category_folders:
        print(f"error: no category subfolders under {root}", file=sys.stderr)
        return 2

    if not (root / "macro" / "NKSC_PARAM" / "DSC_5335.NEF.nksc").exists():
        print(
            "error: master template missing at <root>/macro/NKSC_PARAM/DSC_5335.NEF.nksc",
            file=sys.stderr,
        )
        return 2

    total = {"written": 0, "skipped": 0, "errors": 0}
    for cat, folder in category_folders:
        print(f"=== {cat.value} ===")
        result = apply_preset_to_folder(folder, cat, dry_run=args.dry_run)
        if "error" in result:
            print(f"  error: {result['error']}", file=sys.stderr)
            continue
        for action, name, iso, lumi, target in result["plan"]:
            if action == "skip":
                print(f"  skip  {name}  (existing sidecar)")
            elif action == "write":
                tag = "would write" if args.dry_run else "wrote"
                print(f"  {tag}  {name}  ISO={iso}  LumiSmooth={lumi}  -> {target}")
            elif action == "error":
                print(f"  error {name}: {target}", file=sys.stderr)
        for k in total:
            total[k] += result[k]
        print()

    action = "would write" if args.dry_run else "wrote"
    print(f"{action} {total['written']}, skipped {total['skipped']}, errors {total['errors']}")
    return 1 if total["errors"] else 0


def _cmd_organize(args: argparse.Namespace) -> int:
    import shutil
    from collections import Counter
    from nef_editor.store import Store

    source = Path(args.folder).expanduser()
    if not source.is_dir():
        print(f"error: not a folder: {source}", file=sys.stderr)
        return 2

    db = source / ".nef-editor" / "state.db"
    if not db.exists():
        print(f"error: no database at {db}", file=sys.stderr)
        return 2

    with Store(db) as s:
        records = s.all_records()

    if args.dry_run:
        cats = Counter(r.category.value for r in records)
        print(f"would move {len(records)} files into:")
        for cat, count in cats.most_common():
            if cat != "unclassified":
                print(f"  {cat}/: {count}")
        return 0

    moved = Counter()
    for r in records:
        cat = r.category.value
        if cat == "unclassified":
            continue
        dest_dir = source / cat
        dest_dir.mkdir(exist_ok=True)
        nef = source / r.source_path
        if nef.exists():
            shutil.move(str(nef), str(dest_dir / r.source_path))
            moved[f"{cat}/nef"] += 1
        if r.output_path:
            xmp = source / r.output_path
            if xmp.exists():
                shutil.move(str(xmp), str(dest_dir / r.output_path))
                moved[f"{cat}/xmp"] += 1

    shutil.rmtree(source / ".nef-editor", ignore_errors=True)
    print(f"moved {sum(moved.values())} files")
    for key, count in sorted(moved.items()):
        print(f"  {key}: {count}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
