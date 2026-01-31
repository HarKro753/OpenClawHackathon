#!/usr/bin/env bun

import { browserNavigate } from "./browser.js";

async function testNavigation() {
  console.log("Testing browser navigation...");

  try {
    const result = await browserNavigate("https://www.linkedin.com/messaging/");
    console.log("Navigation successful!");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Navigation failed:", error);
    process.exit(1);
  }
}

testNavigation();
