workspace "NEF Photo Editor CLI" "Classify and correct a folder of Nikon .nef photographs into a separate export folder." {

    model {
        photographer = person "Photographer" "Runs the CLI over a folder of .nef files and reviews the export."

        cli = softwareSystem "NEF Editor CLI" "Reads EXIF, classifies, orchestrates the two render stages, writes the category into the output EXIF, and records every result. Orchestration only: it performs no demosaicing, tone mapping or colour mathematics." "CLI" {
            exifReader = component "EXIF Reader" "Pure-Python TIFF/EXIF parser. Supplies ISO, shutter, aperture and focal length. No external binary." "Component"
            classifier = component "Classifier" "Pure function. Metadata in, category + sub-style + reasons out. Auto-detects night from ISO; other categories are operator-assigned." "Component"
            store = container "State Database" "One row per processed photograph: category, sub-style, the signals that fired, applied correction, output hash. Drives idempotency." "SQLite"
            sourceFolder = container "Source Folder" "The .nef files. Read-only; never modified." "Folder"
            workDir = container "Work Directory" "Intermediate 8-bit JPEG decodes. Deleted after a successful render." "Folder"
            exportDir = container "Export Folder" "Corrected .jpg files, grouped into a subfolder per category." "Folder"
        }

        imageio = softwareSystem "macOS ImageIO" "Runs on the HOST via sips. Decodes Nikon HE* natively at full resolution - an undocumented Apple capability. No proprietary dependency." "External System"

        darktable = softwareSystem "darktable-cli 5.6.1" "Runs in the CONTAINER. Applies the --core correction to the decoded JPEG. The only stage that is containerised." "External System"

        photographer -> cli "Runs over a folder of .nef files"
        cli -> sourceFolder "Scans for .nef, read-only"
        exifReader -> sourceFolder "Reads ISO, shutter, aperture, focal from each file"
        cli -> classifier "Passes metadata in"
        cli -> imageio "Stage 1: HE* -> rendered JPEG, on the host via sips"
        imageio -> workDir "Writes the intermediate JPEG"
        cli -> darktable "Stage 2: DNG -> JPEG, in the container"
        darktable -> exportDir "Writes the corrected .jpg and .xmp sidecar"
        cli -> workDir "Deletes intermediates after a successful render"
        cli -> store "Skips unchanged files; records every result, including failures"
        cli -> exportDir "Writes the category into EXIF ImageDescription and UserComment"
    }

    views {
        systemContext cli "System context - the NEF editor as a whole" {
            include *
            autolayout lr
        }

        container cli "Containers - stages, components and state" {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "CLI" {
                background #1168bd
                color #ffffff
            }
            element "Component" {
                background #438dd5
                color #ffffff
            }
            element "External System" {
                background #999999
                color #ffffff
                shape rectangle
            }
            element "Folder" {
                background #f5f5f5
                color #333333
            }
            element "SQLite" {
                background #f5f5f5
                color #333333
                shape cylinder
            }
        }
    }
}