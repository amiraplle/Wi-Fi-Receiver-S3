Import("env")
import os
import subprocess

def merge_bin_action(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    flash_size = "16MB"
    chip = "esp32s3"

    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    firmware = os.path.join(build_dir, "firmware.bin")
    merged = os.path.join(build_dir, "merged.bin")

    # Locate boot_app0.bin
    framework_dir = env.PioPlatform().get_package_dir("framework-arduinoespressif32")
    boot_app0 = os.path.join(framework_dir, "tools", "partitions", "boot_app0.bin")

    print("\n=======================================================")
    print("[POST-ACTION] Stitching Single Flashable merged.bin ...")
    print("Target: " + merged)
    print("=======================================================\n")

    cmd = [
        "python", "-m", "esptool",
        "--chip", chip,
        "merge_bin",
        "-o", merged,
        "--flash_mode", "dio",
        "--flash_size", flash_size,
        "0x0000", bootloader,
        "0x8000", partitions,
        "0xe000", boot_app0,
        "0x10000", firmware
    ]

    result = subprocess.run(cmd)
    if result.returncode == 0:
        print("[SUCCESS] Created single merged.bin at " + merged)
        print("Flash with: esptool.py --chip esp32s3 write_flash 0x0 merged.bin\n")
    else:
        print("[WARNING] esptool merge_bin failed with return code:", result.returncode)

env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge_bin_action)
