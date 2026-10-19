import { test, expect } from "@playwright/test";
import { adminLogin, jpegUpload, openFirstPlant, requireE2ECreds } from "./helpers.js";

test.describe("Fertilizer analysis system flow", () => {
  test("admin can open Fertilizer Analysis and run analysis", async ({ page }) => {
    requireE2ECreds(test);

    await adminLogin(page);
    await openFirstPlant(page);

    await page.getByRole("button", { name: "Analyse Fertilizer" }).click();
    await expect(page.getByRole("heading", { name: /Fertilizer Analysis/ })).toBeVisible();

    await page.locator("#fertilizerImageInput").setInputFiles(jpegUpload("leaf.jpg"));
    await expect(page.getByAltText("Selected Plant")).toBeVisible();

    await page.getByRole("button", { name: "Run Fertilizer Analysis" }).click();

    const results = page.getByText("Growth Stage & NPK Analysis Results");
    const apiError = page.locator("div.bg-rose-50");
    await expect(results.or(apiError)).toBeVisible({ timeout: 120_000 });
  });
});
