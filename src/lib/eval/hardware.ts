import { execFileSync } from "node:child_process";
import os from "node:os";

/** A short host label for an eval report. No model calls and no secrets. */
export function describeHardware(): string {
  let cpu = os.cpus()[0]?.model?.trim() || "unknown cpu";
  if (process.platform === "darwin") {
    try {
      const brand = execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf8",
      }).trim();
      if (brand) cpu = brand;
    } catch {
      // CI and Linux have no machdep brand string.
    }
  }
  const gigabytes = Math.round(os.totalmem() / 1024 ** 3);
  return `${cpu}, ${gigabytes} GB RAM, ${process.platform}/${process.arch}`;
}
