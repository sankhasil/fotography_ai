"""Convert darktable XMP sidecars to NX Studio .nksc sidecars.

NX Studio uses .nksc files in a NKSC_PARAM/ subfolder. The format is XMP
with a <nine:NineEdits> element containing HTML-escaped XML filters.

This module reads a darktable XMP, extracts the module history, and maps
darktable modules to NX Studio filters. The mapping is partial — darktable's
scene-referred modules (filmicrgb, sigmoid, toneequal) have no NX Studio
equivalent and are skipped. The basic adjustments map cleanly.

Mapping table:
  darktable exposure      → nikon::ExposureSettings (Gain)
  darktable colorbalancergb → nikon::ExposureSettings (SaturationAdjustment)
  darktable monochrome    → nikon::PictureControl (monochrome)
  darktable lens          → nikon::Distortion + nikon::ChrAb (auto)
  darktable highlights    → nikon::ActiveDLighting (HighlightProtection)
  darktable denoiseprofile → nikon::NoiseReduction (slIntensity)
  darktable bilat (clarity) → nikon::ColorBalance (slContrast)
  darktable sharpen       → nikon::LEGeneral (EasySharpening)
  darktable hazeremoval   → nikon::DLightingHQ (shadowAdjustment)
"""

from __future__ import annotations

import base64
import re
import zlib
import struct
from pathlib import Path
from xml.sax import saxutils

from nef_editor.model import Category, SubStyle


def convert_folder(source: Path, *, dry_run: bool = False) -> dict[str, int]:
    """Convert all .xmp sidecars in a folder to .nksc files.

    Looks for <name>.xmp next to <name>.NEF and writes
    NKSC_PARAM/<name>.NEF.nksc. Creates NKSC_PARAM/ if missing.

    Returns a dict with counts: {"converted": N, "skipped": N, "errors": N}
    """
    counts = {"converted": 0, "skipped": 0, "errors": 0}

    xmp_files = sorted(source.glob("*.xmp"))
    for xmp in xmp_files:
        nef = xmp.with_suffix(".NEF")
        if not nef.exists():
            nef = xmp.with_suffix(".nef")
        if not nef.exists():
            counts["skipped"] += 1
            continue

        if dry_run:
            counts["converted"] += 1
            continue

        nksc_dir = source / "NKSC_PARAM"
        nksc_dir.mkdir(exist_ok=True)
        nksc_path = nksc_dir / f"{nef.name}.nksc"

        try:
            nksc_content = convert_xmp_to_nksc(xmp)
            nksc_path.write_text(nksc_content)
            counts["converted"] += 1
        except Exception:
            counts["errors"] += 1

    return counts


def convert_xmp_to_nksc(xmp_path: Path) -> str:
    """Convert a single darktable XMP sidecar to NX Studio .nksc content."""
    xmp = xmp_path.read_text()
    modules = _parse_darktable_modules(xmp)

    template = _load_template()
    edits = _extract_nine_edits(template)

    for mod_name, mod_params in modules.items():
        _apply_module(edits, mod_name, mod_params)

    return _inject_edits(template, edits)


# --- darktable XMP parsing -------------------------------------------------------


def _parse_darktable_modules(xmp: str) -> dict[str, dict]:
    """Extract enabled modules and their decoded params from a darktable XMP."""
    modules: dict[str, dict] = {}

    # Find all <rdf:li> entries with darktable:operation
    pattern = re.compile(
        r'darktable:operation="([^"]+)"'
        r'.*?darktable:enabled="1"'
        r'.*?darktable:modversion="(\d+)"'
        r'.*?darktable:params="([^"]*)"',
        re.DOTALL,
    )

    for match in pattern.finditer(xmp):
        name = match.group(1)
        version = int(match.group(2))
        params_raw = match.group(3)

        if name in ("colorin", "colorout", "gamma", "flip"):
            continue

        decoded = _decode_params(params_raw, name)
        if name not in modules:
            modules[name] = {"version": version, "params": decoded, "count": 1}
        else:
            # Multiple instances — keep the last one's values, increment count
            modules[name]["count"] += 1
            if decoded:
                modules[name]["params"] = decoded

    return modules


def _decode_params(params_raw: str, module_name: str) -> dict:
    """Decode darktable params blob into a dict of values.

    darktable params are either:
    - Plain hex (e.g. exposure: "0000000067029a3b...")
    - gz+base64 with a 3-byte prefix (e.g. colorbalancergb)
    """
    if not params_raw:
        return {}

    if params_raw.startswith("gz"):
        try:
            raw = base64.b64decode(params_raw[2:])
            data = zlib.decompress(raw[3:])
            floats = struct.unpack(f"<{len(data) // 4}f", data[: len(data) // 4 * 4])
            return _interpret_floats(module_name, floats)
        except Exception:
            return {}
    else:
        try:
            data = bytes.fromhex(params_raw)
            floats = struct.unpack(f"<{len(data) // 4}f", data[: len(data) // 4 * 4])
            return _interpret_floats(module_name, floats)
        except Exception:
            return {}


def _interpret_floats(module_name: str, floats: list[float]) -> dict:
    """Map decoded floats to named values per module."""
    if module_name == "exposure":
        # exposure params: [exposure, ...] — first float is the EV offset
        if floats:
            return {"exposure": floats[0]}
    elif module_name == "colorbalancergb":
        # 33 floats; positions 28 and 30 are vibrance and saturation
        if len(floats) >= 31:
            return {
                "vibrance": floats[28],
                "saturation": floats[30],
            }
    elif module_name == "monochrome":
        if floats:
            return {"mix": floats[0]}
    elif module_name == "bilat":
        # bilat (local contrast): has contrast and clarity params
        if len(floats) >= 2:
            return {"contrast": floats[0], "clarity": floats.get(1, 0.0) if isinstance(floats, list) else 0}
    elif module_name == "denoiseprofile":
        if len(floats) >= 1:
            return {"strength": floats[0]}
    return {}


# --- NX Studio .nksc generation -------------------------------------------------


_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "presets" / "nksc-template.xmp"


def _load_template() -> str:
    """Load the .nksc template."""
    if _TEMPLATE_PATH.exists():
        return _TEMPLATE_PATH.read_text()
    # Fallback: minimal template
    return _MINIMAL_TEMPLATE


def _extract_nine_edits(template: str) -> str:
    """Extract the <nine:NineEdits> content (HTML-escaped XML)."""
    match = re.search(r"<nine:NineEdits>(.*?)</nine:NineEdits>", template, re.DOTALL)
    if match:
        return saxutils.unescape(match.group(1))
    return "<userData></userData>"


def _inject_edits(template: str, edits: str) -> str:
    """Inject modified edits back into the template."""
    escaped = saxutils.escape(edits)
    return re.sub(
        r"<nine:NineEdits>.*?</nine:NineEdits>",
        f"<nine:NineEdits>{escaped}</nine:NineEdits>",
        template,
        flags=re.DOTALL,
    )


def _apply_module(edits: str, mod_name: str, mod_data: dict) -> str:
    """Apply a darktable module's effect to the NX Studio edits XML."""
    params = mod_data.get("params", {})

    if mod_name == "exposure":
        ev = params.get("exposure", 0.0)
        if abs(ev) > 0.001:
            edits = _set_filter_value(edits, "nikon::ExposureSettings", "Gain", f"{ev}")
    elif mod_name == "colorbalancergb":
        sat = params.get("saturation", 0.0)
        vib = params.get("vibrance", 0.0)
        if abs(sat) > 0.001 or abs(vib) > 0.001:
            total_sat = int((sat + vib) * 100)
            edits = _set_filter_value(edits, "nikon::ExposureSettings", "SaturationAdjustment", f"{total_sat}")
    elif mod_name == "monochrome":
        edits = _set_filter_attribute(edits, "nikon::PictureControl", "active", "true")
        edits = _set_picture_control_monochrome(edits)
    elif mod_name == "lens":
        edits = _set_filter_attribute(edits, "nikon::Distortion", "active", "true")
        edits = _set_filter_attribute(edits, "nikon::ChrAb", "active", "true")
    elif mod_name == "highlights":
        edits = _set_filter_attribute(edits, "nikon::ActiveDLighting", "active", "true")
        edits = _set_filter_value(edits, "nikon::ActiveDLighting", "HighlightProtection", "20")
    elif mod_name == "denoiseprofile":
        strength = params.get("strength", 0.0)
        edits = _set_filter_attribute(edits, "nikon::NoiseReduction", "active", "true")
        edits = _set_filter_value(edits, "nikon::NoiseReduction", "slIntensity", f"{int(strength * 50)}")
    elif mod_name == "bilat":
        edits = _set_filter_attribute(edits, "nikon::ColorBalance", "active", "true")
        edits = _set_filter_value(edits, "nikon::ColorBalance", "slContrast", "10")
    elif mod_name == "sharpen":
        edits = _set_filter_attribute(edits, "nikon::LEGeneral", "active", "true")
        edits = _set_filter_value(edits, "nikon::LEGeneral", "EasySharpening", "30")
    elif mod_name == "hazeremoval":
        edits = _set_filter_attribute(edits, "nikon::DLightingHQ", "active", "true")
        edits = _set_filter_value(edits, "nikon::DLightingHQ", "shadowAdjustment", "60")

    return edits


def _set_filter_attribute(edits: str, filter_id: str, attr: str, value: str) -> str:
    """Set an attribute (like 'active') on a filter in the edits XML."""
    pattern = rf'(<filter id="{re.escape(filter_id)}"><active>)false(</active>)'
    return re.sub(pattern, rf'\g<1>{value}\g<2>', edits)


def _set_filter_value(edits: str, filter_id: str, param_name: str, value: str) -> str:
    """Set a parameter value inside a filter's <parameters>."""
    # Find the filter block
    filter_pattern = rf'(<filter id="{re.escape(filter_id)}">.*?<parameters>)(.*?)(</parameters></filter>)'
    match = re.search(filter_pattern, edits, re.DOTALL)
    if not match:
        return edits

    params_block = match.group(2)
    # Replace or insert the value
    value_pattern = rf'<{param_name}>[^<]*</{param_name}>'
    if re.search(value_pattern, params_block):
        params_block = re.sub(value_pattern, f'<{param_name}>{value}</{param_name}>', params_block)
    elif f'name="{param_name}"' in params_block:
        # For <integer name="xxx">value</integer> or <double name="xxx">value</double>
        name_pattern = rf'(<(?:integer|double) name="{param_name}">)[^<]*(</)'
        params_block = re.sub(name_pattern, rf'\g<1>{value}\g<2>', params_block)
    else:
        params_block += f'<integer name="{param_name}">{value}</integer>'

    return edits[: match.start()] + match.group(1) + params_block + match.group(3) + edits[match.end():]


def _set_picture_control_monochrome(edits: str) -> str:
    """Set Picture Control to monochrome (simplified)."""
    # Nikon Picture Control monochrome flag is in the ExportData binary blob.
    # For a basic conversion, we just mark the filter active.
    # A full implementation would rebuild the ExportData with monochrome settings.
    return edits


_MINIMAL_TEMPLATE = """<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 5.5.0">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="core-sidear-tags/1.0"
            xmlns:nine="http://ns.nikon.com/nine/1.0/">
         <nine:about>nine-tags</nine:about>
         <nine:version>2.0.0</nine:version>
         <nine:NineEdits>&lt;userData&gt;&lt;/userData&gt;</nine:NineEdits>
         <nine:Label>0</nine:Label>
         <nine:Rating>0</nine:Rating>
         <nine:Trim>/////////////////////w==</nine:Trim>
      </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>

<?xpacket end="w"?>
"""
