import { ArchiveError } from "@ritsuwastaken/farchive";

export class PackageError extends ArchiveError {
  constructor(message: string, offset = -1) {
    super(message, offset);
    this.name = "PackageError";
  }
}
