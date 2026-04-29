import os
import hashlib
from PIL import Image
import imagehash
from tqdm import tqdm
import argparse
from collections import defaultdict
import rawpy
import numpy as np


RAW_EXTENSIONS = {'.NEF', '.cr2', '.cr3', '.arw', '.raf', '.orf', '.dng', '.rw2'}

def open_image(image_path: str) -> Image.Image | None:
    """
    Opens any image — standard formats via Pillow,
    RAW formats (NEF, CR2, ARW…) via rawpy.
    Returns a PIL Image or None on failure.
    """
    ext = os.path.splitext(image_path)[1].lower()

    if ext in RAW_EXTENSIONS:
        try:
            with rawpy.imread(image_path) as raw:
                # postprocess() returns a numpy RGB array
                rgb = raw.postprocess(
                    use_camera_wb=True,   # use the camera's white balance
                    half_size=True,       # faster — half resolution is enough for hashing
                    no_auto_bright=True,
                    output_bps=8,
                )
            return Image.fromarray(rgb)
        except rawpy.LibRawFileUnsupportedError:
            print(f"[WARN] Unsupported RAW format: {image_path}")
            return None
        except Exception as e:
            print(f"[ERROR] RAW decode failed for {image_path}: {e}")
            return None
    else:
        try:
            return Image.open(image_path)
        except Exception as e:
            print(f"[ERROR] Could not open {image_path}: {e}")
            return None
# --- Hashing Functions ---

def calculate_sha1(file_path: str) -> str:
    """Calculates the SHA-1 hash of a file."""
    hasher = hashlib.sha1()
    try:
        with open(file_path, 'rb') as file:
            while chunk := file.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error hashing {file_path}: {e}")
        return ""

def calculate_phash(image_path: str) -> str:
    """Calculates the perceptual hash (pHash) of any image including RAW."""
    img = open_image(image_path)
    if img is None:
        return ""
    try:
        img = img.convert('L')       # grayscale for hashing
        return str(imagehash.phash(img))
    except Exception as e:
        print(f"[ERROR] pHash failed for {image_path}: {e}")
        return ""

# --- Core Logic ---

def get_image_paths(root_dir: str) -> list[str]:
    """Recursively finds all common image extensions in the directory."""
    supported_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.tiff','.NEF')
    image_paths = []
    for root, _, files in os.walk(root_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in supported_extensions:
                image_paths.append(os.path.join(root, file))
    return image_paths

def analyze_duplicates(image_paths: list[str]) -> tuple[dict, dict, dict]:
    """
    Analyzes the list of images for duplicates using SHA1 (exact) and pHash (near).
    Returns: (exact_duplicates, phash_groups, all_hashes)
    """
    
    # 1. Exact Duplicate Check (SHA-1)
    sha1_hashes = defaultdict(list)
    for path in image_paths:
        file_hash = calculate_sha1(path)
        if file_hash:
            sha1_hashes[file_hash].append(path)
            
    exact_duplicates = {h: paths for h, paths in sha1_hashes.items() if len(paths) > 1}

    # 2. Near Duplicate Check (pHash)
    phash_groups = defaultdict(list)
    all_hashes = {} # Store pHash mapping to path for near duplicates
    
    print("\n[INFO] Calculating Perceptual Hashes (This may take time)...")
    for path in tqdm(image_paths, desc="Hashing Images"):
        p_hash = calculate_phash(path)
        if p_hash:
            # Use the pHash string as the key for grouping
            phash_groups[p_hash].append(path)
            all_hashes[path] = p_hash

    # Filter near duplicates: only keep groups with more than one item
    near_duplicates = {h: paths for h, paths in phash_groups.items() if len(paths) > 1}
    
    return exact_duplicates, near_duplicates, all_hashes


def generate_report(exact: dict, near: dict, paths: list[str]):
    """Prints a structured summary report to the console."""
    
    print("\n" + "="*60)
    print("           IMAGE DUPLICATION ANALYSIS REPORT")
    print("="*60)
    
    print(f"\n[SCAN SUMMARY] Scanned {len(paths)} images.")
    
    # --- Exact Duplicates ---
    print("\n" + "-"*20 + " EXACT DUPLICATES (SHA-1) " + "-"*20)
    if exact:
        total_exact_groups = len(exact)
        total_duplicate_files = sum(len(paths) - 1 for paths in exact.values())
        print(f"✅ Found {total_exact_groups} group(s) containing {total_duplicate_files} redundant copy/copies.")
        
        # Show details for the first group as an example
        example_hash = next(iter(exact))
        print(f"\n   Example Group (Hash: {example_hash[:10]}...):")
        for i, path in enumerate(exact[example_hash]):
            print(f"     [{i+1}] {path}")
    else:
        print("✅ No exact duplicates found.")

    # --- Near Duplicates ---
    print("\n" + "-"*20 + " NEAR DUPLICATES (pHash) " + "-"*20)
    if near:
        total_near_groups = len(near)
        total_redundant_images = sum(len(paths) - 1 for paths in near.values())
        print(f"🎨 Found {total_near_groups} group(s) containing {total_redundant_images} near-duplicate copy/copies.")
        
        # Show details for the first group as an example
        example_hash = next(iter(near))
        print(f"\n   Example Group (Hash: {example_hash[:10]}...):")
        for i, path in enumerate(near[example_hash]):
            print(f"     [{i+1}] {path}")
    else:
        print("🎨 No near-duplicate images found.")
        
    print("\n" + "="*60)


# --- Main Execution ---

def main():
    parser = argparse.ArgumentParser(
        description="Analyze a directory for exact and near-duplicate images using hashing techniques.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "directory", 
        type=str, 
        help="The root directory to scan recursively for images."
    )
    args = parser.parse_args()
    
    root_dir = os.path.abspath(args.directory)
    
    if not os.path.isdir(root_dir):
        print(f"Error: Directory not found at '{root_dir}'")
        return

    print(f"🚀 Starting duplicate analysis in: {root_dir}")
    
    # 1. Gather all image paths
    all_image_paths = get_image_paths(root_dir)
    
    if not all_image_paths:
        print("🛑 No supported images found in the specified directory.")
        return
        
    print(f"✅ Found {len(all_image_paths)} image files to process.")

    # 2. Analyze hashes
    exact_dups, near_dups, _ = analyze_duplicates(all_image_paths)

    # 3. Report Results
    generate_report(exact_dups, near_dups, all_image_paths)


if __name__ == "__main__":
    main()