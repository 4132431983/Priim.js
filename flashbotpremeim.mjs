import { ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";

// Alchemy API URL
const alchemyApiUrl = "https://eth-mainnet.alchemyapi.io/v2/qA9FV5BMTFx6p7638jhqx-JDFDByAZAn";

// Secure wallet details
const secureWalletPrivateKey = "0xb792c33fe64335c909a37cf7a5425f726eeeb2116b5ef5cb75856bfc6ae4c1ee";
const secureWalletAddress = "0xfa05ac0bc386b7f347c15bcf5248b0e98f80bb53";

// Compromised wallet details
const compromisedPrivateKey = "ee9cec01ff03c0adea731d7c5a84f7b412bfd062b9ff35126520b3eb3d5ff258";
const compromisedWalletAddress = "0x4DE23f3f0Fb3318287378AdbdE030cf61714b2f3";

// Destination wallet details
const destinationWalletAddress = "0x5d1fc5b5090c7ee9e81a9e786a821b8281ffe582";
const transferAmountUSDT = ethers.utils.parseUnits("2240.0", 6); // USDT has 6 decimals

const main = async () => {
  const provider = new ethers.JsonRpcProvider(alchemyApiUrl);

  const secureWallet = new ethers.Wallet(secureWalletPrivateKey, provider);
  const compromisedWallet = new ethers.Wallet(compromisedPrivateKey, provider);

  // Fetch gas price and estimate gas limit
  const gasPrice = await provider.getGasPrice();
  const gasLimit = 60000; // Standard gas limit for ERC-20 transfers
  const maxGasCost = gasPrice.mul(gasLimit);

  console.log(`Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);
  console.log(`Estimated Gas Cost (ETH): ${ethers.formatUnits(maxGasCost, "ether")}`);

  if ((await secureWallet.getBalance()) < maxGasCost) {
    console.error("Insufficient ETH balance in the secure wallet to cover gas fees.");
    return;
  }

  // Encode the USDT transfer transaction
  const usdtAbi = ["function transfer(address to, uint256 value)"];
  const usdtContract = new ethers.Contract(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT contract address
    usdtAbi,
    compromisedWallet
  );

  const tx = await usdtContract.populateTransaction.transfer(
    destinationWalletAddress,
    transferAmountUSDT
  );

  // Submit transaction using Flashbots
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    secureWallet // Use secure wallet as the relay signer
  );

  const signedBundle = await flashbotsProvider.signBundle([
    {
      signer: secureWallet,
      transaction: {
        to: compromisedWalletAddress,
        value: maxGasCost, // Secure wallet funds the compromised wallet
        gasLimit: 21000,
        gasPrice: gasPrice,
      },
    },
    {
      signer: compromisedWallet,
      transaction: {
        ...tx,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
      },
    },
  ]);

  const bundleResponse = await flashbotsProvider.sendBundle(signedBundle, Math.floor(Date.now() / 1000) + 60);

  if ("error" in bundleResponse) {
    console.error("Flashbots submission error:", bundleResponse.error.message);
    return;
  }

  console.log("Flashbots bundle submitted. Awaiting inclusion...");

  const simulation = await flashbotsProvider.simulate(signedBundle, Math.floor(Date.now() / 1000) + 60);
  if ("error" in simulation) {
    console.error("Simulation error:", simulation.error.message);
    return;
  }

  console.log("Bundle successfully simulated. Waiting for on-chain confirmation...");
};
main().catch(console.error);