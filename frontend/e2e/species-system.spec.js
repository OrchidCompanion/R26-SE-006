import { test, expect } from "@playwright/test";
import { adminLogin, jpegUpload, requireE2ECreds } from "./helpers.js";

test.describe("Species identification system flow", () => {
  test("admin can identify orchid species from the dashboard", async ({ page }) => {
    requireE2ECreds(test);

    await adminLogin(page);

    await page.getByRole("button", { name: "Identify Orchid Species" }).click();
    await expect(
      page.getByRole("heading", { name: "Orchid Species Identification" })
    ).toBeVisible();

    await page.locator("#orchid-images").setInputFiles(jpegUpload("orchid.jpg"));
    await expect(page.getByText("Selected Images (1)")).toBeVisible();

    await page.getByRole("button", { name: /Run Detection on 1 Image/ }).click();

    await expect(
      page.getByText(/Species Match|Multi-Species Detected|Not Identified/)
    ).toBeVisible({ timeout: 120_000 });
  });
});
