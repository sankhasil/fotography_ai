#!/usr/bin/env python3
"""
Pre-download all ML model weights for offline use.

Usage:
    python setup_models.py          # download all
    python setup_models.py --only quality   # just pyiqa
    python setup_models.py --only aesthetic  # just LAION
    python setup_models.py --only faces      # just InsightFace
"""
import argparse
import sys


def download_quality_models(device="cpu"):
    print("[1/3] Downloading pyiqa quality models...")
    try:
        import pyiqa
        for name in ["topiq_nr", "brisque", "musiq"]:
            print(f"  Loading {name}...")
            pyiqa.create_metric(name, device=device)
        print("  ✓ Quality models ready")
    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False
    return True


def download_aesthetic_models():
    print("[2/3] Downloading LAION aesthetic model...")
    try:
        import open_clip
        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-L-14", pretrained="openai"
        )
        print("  ✓ Aesthetic model ready")
    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False
    return True


def download_face_models():
    print("[3/3] Downloading InsightFace models...")
    try:
        from insightface.app import FaceAnalysis
        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1)
        print("  ✓ Face model ready")
    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False
    return True


def main():
    ap = argparse.ArgumentParser(description="Download DupeScope ML models")
    ap.add_argument("--only", choices=["quality", "aesthetic", "faces"])
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    print("DupeScope — Model Setup\n")
    results = []

    if not args.only or args.only == "quality":
        results.append(("quality", download_quality_models(args.device)))
    if not args.only or args.only == "aesthetic":
        results.append(("aesthetic", download_aesthetic_models()))
    if not args.only or args.only == "faces":
        results.append(("faces", download_face_models()))

    print("\n" + "─" * 40)
    for name, ok in results:
        status = "✓" if ok else "✗"
        print(f"  {status} {name}")

    failed = [n for n, ok in results if not ok]
    if failed:
        print(f"\nFailed: {', '.join(failed)}")
        sys.exit(1)
    print("\nAll models ready for offline use.")


if __name__ == "__main__":
    main()
