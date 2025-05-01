import {
    createPublicClient,
    createWalletClient,
    formatEther,
    getContract,
    http,
    parseEther,
    parseGwei,
    publicActions,
} from "viem";
import { baseSepolia, foundry } from "viem/chains";
import dotenv from "dotenv";
import WETH_ABI from './abis/weth.json' with { type: 'json' };
import { privateKeyToAccount } from "viem/accounts";

dotenv.config();


const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

const main = async () => {
    // 创建一个公共客户端
    const publicClient = createPublicClient({
        chain: baseSepolia, // mainnet, ....
        transport: http(),
    });


    const blockNumber = await publicClient.getBlockNumber();
    console.log(`The block number is ${blockNumber}`);


    // Get the balance of an address
    const tbalance = formatEther(await publicClient.getBalance({
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    }));

    console.log(`The balance of 0xf39 is ${tbalance}`);

    // 创建一个钱包客户端
    const account = privateKeyToAccount(
        process.env.PRIVATE_KEY! as `0x${string}`
    );

    const walletClient = createWalletClient({
        account,
        chain: foundry,
        transport: http(process.env.RPC_URL!),
    }).extend(publicActions);

    const address = await walletClient.getAddresses();

    const wethContract = getContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        client: {
            public: publicClient,
            wallet: walletClient,
        },
    });

    // 读取合约 方法 1
    const balance1 = formatEther(BigInt(await wethContract.read.balanceOf([
        address.toString(),
    ]) as string));
    console.log(`方法 1 获取的余额是 ${address.toString()} is ${balance1}`);

    // 读取合约 方法 2
    const balance = formatEther(
        BigInt(
            (await publicClient.readContract({
                address: WETH_ADDRESS,
                abi: WETH_ABI,
                functionName: "balanceOf",
                args: [address.toString()],
            })) as string
        )
    );
    console.log(`方法 2 获取的余额是 ${address.toString()} is ${balance}`);

  // Execute the deposit transaction on the WETH smart contract
    /* const hash = await contract.write.deposit([], {
        value: parseEther("0.000001"),
    });

    console.log(`The transaction hash is ${hash}`); */

    /* const hash = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: 'deposit',
        args: [],
        value: parseEther("0.000001")
    });
    console.log(`The transaction hash is ${hash}`); */

};

main();