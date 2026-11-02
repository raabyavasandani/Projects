import { describe, expect, it } from "vitest";
import { uniqueNames } from "./zip";

describe("uniqueNames", () => {
  it("suffixes duplicates case-insensitively", () => {
    expect(uniqueNames(["a.jpg", "b.jpg", "A.jpg", "a.jpg", "noext"])).toEqual([
      "a.jpg",
      "b.jpg",
      "A (2).jpg",
      "a (3).jpg",
      "noext",
    ]);
  });
});
