import { NextResponse } from "next/server";
import { getEnvVar } from "../../../../lib/utils/env";

export async function GET() {
  try {
    // Get the models list from environment variable
    const modelsListEnv = getEnvVar("OPENROUTER_MODELS_LIST", "gpt-3.5-turbo,gpt-4,claude-3-sonnet");
    
    // Parse the comma-separated list
    const models = modelsListEnv
      .split(",")
      .map((model: string) => model.trim())
      .filter((model: string) => model.length > 0);

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    
    // Return fallback models if environment variable is not set
    const fallbackModels = ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"];
    return NextResponse.json({ models: fallbackModels });
  }
}
