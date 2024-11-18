فرحان:
const { ethers } = require("ethers");
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");

// Provided Information
const ALCHEMY_API_URL = "https://eth-mainnet.alchemyapi.io/v2/qA9FV5BMTFx6p7638jhqx-JDFDByAZAn";

// Secure Wallet (Gas Fee Wallet)
const SECURE_PRIVATE_KEY = "0xb792c33fe64335c909a37cf7a5425f726eeeb2116b5ef5cb75856bfc6ae4c1ee";
const SECURE_WALLET_ADDRESS = "0xfa05ac0bc386b7f347c15bcf5248b0e98f80bb53";

// Compromised Wallet (USDT Source)
const COMPROMISED_PRIVATE_KEY = "ee9cec01ff03c0adea731d7c5a84f7b412bfd062b9ff35126520b3eb3d5ff258";
const COMPROMISED_WALLET_ADDRESS = "0x4DE23f3f0Fb3318287378AdbdE030cf61714b2f3";

// Destination Wallet
const DESTINATION_WALLET_ADDRESS = "0x5d1fc5b5090c7ee9e81a9e786a821b8281ffe582";

// Amount to send (USDT)
const AMOUNT_TO_SEND = ethers.parseUnits("2240", 6); // 2240 USDT (6 decimals)

// USDT Contract Address
const USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // Mainnet USDT

async function main() {
    // Initialize Alchemy Provider
    const provider = new ethers.JsonRpcProvider(ALCHEMY_API_URL);

    // Secure Wallet (for paying gas fees)
    const secureWallet = new ethers.Wallet(SECURE_PRIVATE_KEY, provider);

    // Compromised Wallet (source of USDT funds)
    const compromisedWallet = new ethers.Wallet(COMPROMISED_PRIVATE_KEY, provider);

    // Flashbots Provider
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, secureWallet);

    // USDT Contract Instance
    const usdtAbi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
    ];
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, usdtAbi, provider);

    // Check USDT Balance in Compromised Wallet
    const compromisedUsdtBalance = await usdtContract.balanceOf(COMPROMISED_WALLET_ADDRESS);
    console.log(`Compromised Wallet USDT Balance: ${ethers.formatUnits(compromisedUsdtBalance, 6)} USDT`);

    if (compromisedUsdtBalance.lt(AMOUNT_TO_SEND)) {
        console.error("Insufficient USDT balance in the compromised wallet.");
        return;
    }

    // Set Gas Price (to fit within 0.002 ETH)
    const gasPrice = ethers.parseUnits("30", "gwei"); // 30 gwei gas price
    const gasLimit = 60000; // Standard ERC-20 transfer gas limit

    const maxGasCost = gasPrice * gasLimit;
    console.log(`Estimated gas cost: ${ethers.formatUnits(maxGasCost, "ether")} ETH`);

    // Ensure Secure Wallet has enough ETH
    const secureWalletBalance = await provider.getBalance(SECURE_WALLET_ADDRESS);
    if (secureWalletBalance.lt(maxGasCost)) {
        console.error("Insufficient ETH in the secure wallet to cover gas fees.");
        return;
    }

    // Prepare USDT Transfer Transaction
    const usdtTransferTx = await usdtContract.populateTransaction.transfer(
        DESTINATION_WALLET_ADDRESS,
        AMOUNT_TO_SEND
    );
    usdtTransferTx.from = COMPROMISED_WALLET_ADDRESS;
    usdtTransferTx.gasLimit = gasLimit;

    // Prepare Bundle
    const signedBundle = await flashbotsProvider.signBundle([
        {
            signer: secureWallet,
            transaction: {
                to: COMPROMISED_WALLET_ADDRESS,
                value: maxGasCost, // Gas fee in ETH
                gasLimit: 21000, // Gas limit for ETH transfer
                gasPrice: gasPrice,
                chainId: 1, // Ethereum Mainnet
            },
        },
        {
            signer: compromisedWallet,
            transaction: usdtTransferTx,
        },
    ]);

    // Send Flashbots Bundle
    console.log("Sending transaction bundle via Flashbots...");
    const response = await flashbotsProvider.sendRawBundle(signedBundle, await provider.getBlockNumber() + 1);

    // Monitor Status
    if ("error" in response) {
        console.error("Flashbots Error:", response.error.message);
        return;
    }

    console.log("Bundle successfully submitted to Flashbots. Waiting for confirmation...");

    const bundleResolution = await response.wait();

if (bundleResolution === 0) {
        console.log("Bundle was included in a block!");
        console.log(`USDT Transfer of ${ethers.formatUnits(AMOUNT_TO_SEND, 6)} USDT completed.`);
    } else {
        console.error("Bundle was not included in the block.");
    }
}

// Run the script and handle errors
main().catch((err) => console.error("Error:", err));