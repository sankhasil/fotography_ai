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
            "Classify Nikon .nef photographs and export corrected JPEGs into a "
            "separate folder grouped by category. Originals are never modified."
        ),
        epilog=(
            "Only 'night' is detected automatically (ISO >= 3200). Assign any "
            "other category with --category.\n"
            f"categories: {_choices('category', ASSIGNABLE_CATEGORIES)}\n"
            f"sub-styles: {_choices('sub-style', SUB_STYLES)}"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("folder", help="folder containing .nef files")
    parser.add_argument("--out", help="export root. default: <folder>_exported")
    parser.add_argument(
        "--category", choices=ASSIGNABLE_CATEGORIES,
        help="assign a category instead of detecting one",
    )
    parser.add_argument(
        "--sub-style", choices=SUB_STYLES, default=SubStyle.NEUTRAL.value,
        help="aesthetic intent. never detected. default: neutral",
    )
    parser.add_argument("--recursive", action="store_true", help="descend into subfolders")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="classify and report only; convert nothing and write no database rows",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="reprocess even when the idempotency key is unchanged",
    )
    parser.add_argument("--db", help="database location. default: <out>/.nef-editor/state.db")
    parser.add_argument(
        "--keep-intermediates", action="store_true",
        help="keep the stage-one decodes instead of deleting them",
    )
    parser.add_argument("--work", help="intermediate directory. default: a temporary one")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        # argparse handles --help and flag errors itself. Convert to a return
        # value so main() is testable and never unwinds the caller.
        return int(exc.code or 0)

    source = Path(args.folder).expanduser()
    if not source.is_dir():
        print(f"error: not a folder: {source}", file=sys.stderr)
        return 2

    out = Path(args.out).expanduser() if args.out else source.parent / f"{source.name}_exported"

    opts = Options(
        source=source,
        out=out,
        category=Category(args.category) if args.category else None,
        sub_style=SubStyle(args.sub_style),
        recursive=args.recursive,
        dry_run=args.dry_run,
        force=args.force,
        db=Path(args.db).expanduser() if args.db else None,
        keep_intermediates=args.keep_intermediates,
        work=Path(args.work).expanduser() if args.work else None,
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


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())