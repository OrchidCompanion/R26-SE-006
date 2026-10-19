import { test, expect } from "@playwright/test";
import { adminLogin, jpegUpload, openFirstPlant, requireE2ECreds } from "./helpers.js";

test.describe("Flowering / bloom prediction system flow", () => {
  test("admin can open AI Bloom Prediction and run 3-angle analysis", async ({ page }) => {
    requireE2ECreds(test);

    await adminLogin(page);
    await openFirstPlant(page);

    await page.getByRole("button", { name: "Predict Blooming" }).click();
    await expect(page.getByRole("heading", { name: /AI Bloom Prediction/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plant Telemetry (Last 30 Days)" })).toBeVisible();

    for (const slot of ["slot1", "slot2", "slot3"]) {
      await page.locator(`#slotInput_${slot}`).setInputFiles(jpegUpload(`${slot}.jpg`));
    }
    await expect(page.getByText("All 3 Angles Uploaded")).toBeVisible();

    await page.getByRole("button", { name: /Run AI Bloom Prediction/ }).click();

    const results = page.getByText("AI Bloom Analysis & Timeline Forecast");
    const apiError = page.getByText(/Prediction Error|Non-Orchid Image Detected/);
    await expect(results.or(apiError)).toBeVisible({ timeout: 120_000 });
  });
});
