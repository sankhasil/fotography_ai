import os
import json
import shutil
import logging
from datetime import datetime
import sys

# -------------------------
# Logging setup
# -------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# -------------------------
# Helpers
# -------------------------
def resolve_path(root_dir: str, path_value: str) -> str:
    """Resolve absolute or relative paths safely."""
    if os.path.isabs(path_value):
        return path_value
    return os.path.join(root_dir, path_value)


def get_unique_destination(base_path: str) -> str:
    """Avoid overwriting files in archive."""
    if not os.path.exists(base_path):
        return base_path

    base, ext = os.path.splitext(base_path)
    counter = 1

    while True:
        new_path = f"{base}_{counter}{ext}"
        if not os.path.exists(new_path):
            return new_path
        counter += 1


# -------------------------
# Core processing
# -------------------------
def process_report_files(report_path: str, root_dir: str, dry_run: bool = False):
    logging.info(f"Processing report: {report_path}")

    summary_data = {
        "processing_timestamp": datetime.now().isoformat(),
        "original_report_file": os.path.basename(report_path),
        "status": "SUCCESS",
        "archived_files_count": 0,
        "archived_files_list": [],
        "dry_run": dry_run
    }

    # -------------------------
    # Load JSON
    # -------------------------
    try:
        with open(report_path, 'r') as f:
            report_content = json.load(f)
    except json.JSONDecodeError:
        logging.error(f"Invalid JSON: {report_path}")
        summary_data["status"] = "JSON_DECODE_ERROR"
        return summary_data
    except Exception as e:
        logging.exception(f"Failed to read report: {e}")
        summary_data["status"] = f"READ_ERROR: {str(e)}"
        return summary_data

    files_to_process = report_content.get("ai_delete", [])

    if not files_to_process:
        logging.info("No files to process.")
        summary_data["message"] = "No files targeted for cleanup."
        return summary_data

    logging.info(f"{len(files_to_process)} files found in report.")

    # -------------------------
    # Process each file
    # -------------------------
    for item in files_to_process:

        # Validate structure
        if not isinstance(item, dict):
            logging.warning(f"Invalid entry (not dict): {item}")
            continue

        path_value = item.get("path")

        if not path_value or not isinstance(path_value, str):
            logging.warning(f"Missing/invalid path in item: {item}")
            continue

        full_source_path = resolve_path(root_dir, path_value)

        if not os.path.exists(full_source_path):
            logging.warning(f"File not found: {full_source_path}")
            summary_data["archived_files_list"].append({
                "path": path_value,
                "status": "NOT_FOUND"
            })
            continue

        # ✅ NEW: archive folder next to original file
        source_dir = os.path.dirname(full_source_path)
        archive_dir = os.path.join(source_dir, "_ARCHIVED")
        os.makedirs(archive_dir, exist_ok=True)

        filename = os.path.basename(full_source_path)
        destination_path = os.path.join(archive_dir, filename)
        destination_path = get_unique_destination(destination_path)

        try:
            if dry_run:
                logging.info(f"[DRY-RUN] Would move: {full_source_path} -> {destination_path}")
            else:
                shutil.move(full_source_path, destination_path)
                logging.info(f"Moved: {full_source_path} -> {destination_path}")

            summary_data["archived_files_count"] += 1
            summary_data["archived_files_list"].append({
                "path": path_value,
                "source": full_source_path,
                "destination": destination_path,
                "status": "ARCHIVED" if not dry_run else "DRY_RUN"
            })

        except Exception as e:
            logging.exception(f"Failed to move file: {full_source_path}")
            summary_data["archived_files_list"].append({
                "path": path_value,
                "status": f"MOVE_ERROR: {str(e)}"
            })

    return summary_data


# -------------------------
# Main processor
# -------------------------
def main_processor(root_directory: str, dry_run: bool = False):
    if not os.path.isdir(root_directory):
        logging.error("Invalid directory.")
        sys.exit(1)

    logging.info(f"Starting processing in: {root_directory}")

    for root, _, files in os.walk(root_directory):
        for file in files:
            if file.endswith("report.json"):
                report_path = os.path.join(root, file)

                summary = process_report_files(
                    report_path,
                    root_directory,
                    dry_run=dry_run
                )

                output_path = os.path.join(root, "processed-summary.json")

                with open(output_path, "w") as f:
                    json.dump(summary, f, indent=4)

                logging.info(f"Summary written: {output_path}")


# -------------------------
# CLI entry
# -------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <root_directory> [--dry-run]")
        sys.exit(1)

    target_directory = sys.argv[1]
    dry_run_flag = "--dry-run" in sys.argv

    main_processor(target_directory, dry_run=dry_run_flag)