const fs = require("fs");
const path = require("path");

// Path to the folder containing all ABI files
const abiFolder = path.resolve(__dirname, "abis");

// Function to extract functions from an ABI
function extractFunctionsFromABI(abiPath) {
  const rawData = fs.readFileSync(abiPath, "utf8");
  const abiData = JSON.parse(rawData);

  // Extract the ABI field if present
  const abi = abiData.abi || abiData;

  return abi
    .filter((item) => item.type === "function")
    .map((func) => ({
      Function: func.name || "Unknown",
      Inputs: func.inputs
        ? func.inputs.map((input) => `${input.name} (${input.type})`).join(", ")
        : "None",
      Outputs: func.outputs
        ? func.outputs.map((output) => `${output.name} (${output.type})`).join(", ")
        : "None",
      Mutability: func.stateMutability || "Unknown",
    }));
}

// Function to process all ABI files in the folder
function processABIFiles(folderPath) {
  const files = fs.readdirSync(folderPath).filter((file) => file.endsWith(".json"));

  const results = {};
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const contractName = path.basename(file, ".json");
    const functions = extractFunctionsFromABI(filePath);
    results[contractName] = functions;
  }

  return results;
}

// Main function to process and display the results in a table
function main() {
  const functionsByContract = processABIFiles(abiFolder);

  console.log("=== Available Functions by Contract ===\n");
  for (const [contract, functions] of Object.entries(functionsByContract)) {
    console.log(`Contract: ${contract}`);
    console.table(functions); // Display functions in a table format
  }
}

// Run the main function
main();
