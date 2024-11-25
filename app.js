const { JsonRpcProvider, Contract, getAddress, formatUnits } = require("ethers");
const fs = require("fs");

// Holesky RPC
const provider = new JsonRpcProvider("https://ethereum-holesky.publicnode.com");

const erc20ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

// Load contracts
const delegationManager = loadContract("./abis/DelegationManager.json", "0xA44151489861Fe9e3055d95adC98FbD462B948e7");

listFunctions("./abis/DelegationManager.json");


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
        const [strategies, shares] = await delegationManager.getDelegatableShares(operatorAddress);
        console.log("Delegatable Strategies:", strategies);
        console.log("Delegatable Shares:", shares);
        
        queryDelegations(strategies, operatorAddress, [stakerAddress]);

        // Query 4: DelegationManager - Get withdrawal delays for strategies
        const mutableStrategies = [...strategies];
        const withdrawalDelays = await delegationManager.getWithdrawalDelay(mutableStrategies);
        const averageBlockTimeInSeconds = 13.5; // Midpoint of 12–15 seconds
        const delayInSeconds = Number(withdrawalDelays) * averageBlockTimeInSeconds;

        console.log(`Withdrawal Delays:
        - Blocks: ${withdrawalDelays.toString()}
        - Approximate Time: ${delayInSeconds.toFixed(1)} seconds (~${(delayInSeconds / 60).toFixed(1)} minutes)
        `);

        // Query 5: DelegationManager - Get operator details
        const operatorDetails = await delegationManager.operatorDetails(operatorAddress);
        console.log(`Operator Details:
    Operator Address: ${operatorDetails[0]}
    Delegation Approver: ${operatorDetails[1]}
    Staker Opt-Out Window: ${operatorDetails[2]} blocks`);
    
    
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
      for (const strategyAddress of strategies) {
        // Load the StrategyBase contract
        const strategyManager = loadContract("./abis/StrategyBase.json", strategyAddress);
  
        // Query the underlying token address
        const tokenAddress = await strategyManager.underlyingToken();
  
        // Load the ERC20 token contract
        const tokenContract = new Contract(tokenAddress, erc20ABI, provider);
  
        // Query token metadata
        const name = await tokenContract.name();
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();
  
        console.log(`\n=== Strategy at ${strategyAddress} ===`);
        console.log(`Token: ${name} (${symbol}), Decimals: ${decimals}`);
        operatorShares = await strategyManager.shares(operator);
        // Query delegation data for each staker
        for (const staker of stakers) {
          const delegatedShares = await strategyManager.shares(staker);
          const totalShares = await strategyManager.totalShares();
  
          // Convert shares to underlying token amounts
          const delegatedTokens = await strategyManager.sharesToUnderlyingView(delegatedShares);
          const totalTokens = await strategyManager.sharesToUnderlyingView(totalShares);
  
          // Format the numbers to human-readable amounts
          const readableDelegatedTokens = formatNumber(parseFloat((formatUnits(delegatedTokens, decimals))));
          const readableOperatorShares = formatNumber(parseFloat((formatUnits(operatorShares, decimals))));
          const readableTotalTokens = formatNumber(parseFloat(formatUnits(totalTokens, decimals)));
         
          // Output the staker's delegation
          console.log(`Staker ${staker} has delegated ${readableDelegatedTokens} /  ${readableOperatorShares} ${symbol} to Operator` );
          console.log(`Operator ${staker} has delegated ${readableOperatorShares} /  ${readableTotalTokens} ${symbol} in total`);
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