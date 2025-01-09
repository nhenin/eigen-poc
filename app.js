const { JsonRpcProvider, Contract, getAddress, formatUnits,keccak256,AbiCoder,parseUnits } = require("ethers");

const fs = require("fs");

// Holesky RPC
const provider = new JsonRpcProvider("https://holesky.infura.io/v3/6055a50a18cf42a595723cbf9fc2fd1f");

const erc20ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

// Example usage
const avsAddress = "0xa7b2e7830c51728832d33421670dbbe30299fd92";
const operatorAddress = "0x0a3e3d83c99b27ca7540720b54105c79cd58dbdd";

// queryAVSOperatorStatus(avsAddress, operatorAddress);


// Load contracts
const delegationManager = loadContract("./abis/DelegationManager.json", "0xA44151489861Fe9e3055d95adC98FbD462B948e7");

listFunctions("./abis/DelegationManager.json");
const strategyManagerAddress =  getAddress("0x6cdA20abb7A5361c7052C91b1ABa79AF1819A94A");
// const strategyManager = loadContract("./abis/StrategyBase.json", strategyManagerAddress);

(async () => {
    try {
        // Query 1: DelegationManager - Get operator a staker is delegated to
        const stakerAddress = getAddress("0x6cdA20abb7A5361c7052C91b1ABa79AF1819A94A");
        const operatorAddress =  await delegationManager.delegatedTo(stakerAddress);
        if (!operatorAddress) {
            console.error("No operator found for the staker.");
            return;
        }
        console.log("Operator Address:", operatorAddress);
        
        // Query 2: DelegationManager - Check if the operator is valid
        const isOperator = await delegationManager.isOperator(operatorAddress);
        if (!isOperator) {
            console.error("The operator is not registered.");
            return;
        }
        console.log("Is Operator:", isOperator);
  

        // Query 3: DelegationManager - Get delegatable shares for the operator
        
        const [strategies, shares] = await delegationManager.getDepositedShares(operatorAddress);
        console.log("Delegatable Strategies:", strategies);
        console.log("Delegatable Shares:", shares);
        console.log("3");
        queryDelegations(strategies, operatorAddress, [stakerAddress]);

    } catch (error) {
        console.error("Error querying contract:", error);
    }
})();



/**
 * Load a contract instance from an ABI file and a contract address.
 * @param {string} abiFilePath - Path to the ABI JSON file.
 * @param {string} contractAddress - Contract address.
 * @returns {Contract} - Ethers.js contract instance.
 */
function loadContract(abiFilePath, contractAddress) {
    try {
        const abiFile = JSON.parse(fs.readFileSync(abiFilePath, "utf-8"));
        if (abiFile && abiFile.abi && Array.isArray(abiFile.abi)) {
            return new Contract(contractAddress, abiFile.abi, provider);
        } else {
            throw new Error("Invalid ABI format in file.");
        }
    } catch (error) {
        console.error(`Error loading ABI from ${abiFilePath}:`, error.message);
        process.exit(1);
    }
}

function listFunctions(abiFilePath) {
    try {
        const abi = JSON.parse(fs.readFileSync(abiFilePath, "utf-8")).abi;
        const functions = abi.filter(item => item.type === "function").map(item => item.name);
        console.log(`Functions in ${abiFilePath} :`, functions);
    } catch (error) {
        console.error(`Error reading ABI file: ${error.message}`);
    }
}

async function queryDelegations(strategies, operator, stakers) {
    try {
      for (const strategyBaseAddress of strategies) {
        // Load the StrategyBase contract
        const strategyBase = loadContract("./abis/StrategyBase.json", strategyBaseAddress);
        
        // Query the underlying token address
        const tokenAddress = await strategyBase.underlyingToken();
  
        // Load the ERC20 token contract
        const tokenContract = new Contract(tokenAddress, erc20ABI, provider);
  
        // Query token metadata
        const name = await tokenContract.name();
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();
  
        console.log(`\n=== Strategy at ${strategyBaseAddress} ===`);
        console.log(`Token: ${name} (${symbol}), Decimals: ${decimals}`);
        operatorShares = await strategyBase.shares(operator);
        // Query delegation data for each staker
        for (const staker of stakers) {
          const delegatedShares = await strategyBase.shares(staker);
          const totalShares = await strategyBase.totalShares();
  
          // Convert shares to underlying token amounts
          const delegatedTokens = await strategyBase.sharesToUnderlyingView(delegatedShares);
          const totalTokens = await strategyBase.sharesToUnderlyingView(totalShares);
  
          // Format the numbers to human-readable amounts
          const readableDelegatedTokens = formatNumber(parseFloat((formatUnits(delegatedTokens, decimals))));
          const readableOperatorShares = formatNumber(parseFloat((formatUnits(operatorShares, decimals))));
          const readableTotalTokens = formatNumber(parseFloat(formatUnits(totalTokens, decimals)));
         
          // Output the staker's delegation
          console.log(`Staker ${staker} has delegated ${readableDelegatedTokens} /  ${readableOperatorShares} ${symbol} to Operator` );
          console.log(`Operator ${staker} has delegated ${readableOperatorShares} /  ${readableTotalTokens} ${symbol} in total`);
          const baseSlot = 205;
          // Compute the outer slot for the staker
          const abiCoder = new AbiCoder();
          // Step 1: Compute outer slot
          const outerSlot = keccak256(
                abiCoder.encode(["address", "uint256"], [staker, baseSlot])
          );
          console.log("Outer Slot:", outerSlot);

          // Step 2: Compute final slot
          const finalSlot = keccak256(
                abiCoder.encode(["address", "bytes32"], [strategyBaseAddress, outerSlot])
          );
          console.log("Final Slot:", finalSlot);

 
          const rawDelegatedShares = await provider.send("eth_getStorageAt", [strategyManagerAddress, finalSlot, "latest"]);
          const parsedShares = parseInt(rawDelegatedShares, 16);
          const readableDelegatedShares = formatNumber(parseFloat((formatUnits(parsedShares, decimals))));
          console.log(`(low level version) : Staker ${staker} has delegated ${readableDelegatedShares} ${symbol} to Operator` );
        }  
      }
    } catch (error) {
      console.error("Error querying delegations:", error);
    }
  }

// Utility to format numbers in human-readable form
function formatNumber(value) {
    const absValue = Math.abs(value);
    if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (absValue >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(2);
  }


  /**
 * Queries the AVS operator status and logs the details.
 * 
 * @param {string} avsAddress - The address of the AVS (Autonomous Validation Strategy).
 * @param {string} operatorAddress - The address of the operator to query.
 */
async function queryAVSOperatorStatus(avsAddress, operatorAddress) {
    try {
        // Load the AVS contract
        const avsContract = loadContract("./abis/AVSDirectory.json", "0x055733000064333CaDDbC92763c58BF0192fFeBf");

        // Query the avsOperatorStatus
        const operatorStatus = await avsContract.avsOperatorStatus(avsAddress, operatorAddress);

        // Display the operator's status
        console.log(`Operator Status for ${operatorAddress} in AVS ${avsAddress}:`);
        console.log(`- Registered: ${operatorStatus.isRegistered}`);
        console.log(`- Staked Amount: ${formatUnits(operatorStatus.stakedAmount, 18)} ETH`);
        console.log(`- Registration Timestamp: ${new Date(operatorStatus.registrationTimestamp * 1000).toLocaleString()}`);
    } catch (error) {
        console.error("Error querying AVS operator status:", error);
    }
}
