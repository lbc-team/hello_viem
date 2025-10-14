import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodePacked, pad, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";


const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

const publicClient = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

const walletClient = createWalletClient({
  account,
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

const usdc = {
    address: "0x1613beB3B2C4f22Ee086B2b38C1476A3cE7f78E8" as const,
};

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);

// 计算 mapping(address => uint256) slot 的工具
function computeMappingSlot(addr: `0x${string}`, slotIndex: bigint): `0x${string}` {
    return keccak256(
        encodePacked(
        ["bytes32", "bytes32"],
        [pad(addr as `0x${string}`, { size: 32 }), pad(`0x${slotIndex.toString(16)}` as `0x${string}`, { size: 32 })]
        )
    );
}

async function main() {
    const to = "0x000000000000000000000000000000000000dEaD";
    const amount = 1_000_000n; // 1 USDC

    const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
    });

    // 1️⃣ 普通 gas 估算
    const gasNormal = await publicClient.estimateGas({
        account,
        to: usdc.address,
        data,
    });
    console.log("Normal transfer gas:", gasNormal);

    // 2️⃣ eth_createAccessList
    const res = await publicClient.request({
        method: "eth_createAccessList",
        params: [
        {
            from: account.address,
            to: usdc.address,
            data,
            value: "0x0",
        },
        "latest",
        ],
    });
    console.log("eth_createAccessList gasUsed:", res.gasUsed);
    console.log("Recommended accessList:", res.accessList);

    // 3️⃣ 手动计算 slot (balanceOf[from], balanceOf[to])
    const slotFrom = computeMappingSlot(account.address, 0n);
    const slotTo = computeMappingSlot(to, 0n);

    console.log("Computed slot(from):", slotFrom);
    console.log("Computed slot(to):  ", slotTo);

    // 4️⃣ 用 eth_createAccessList 的结果再次估算
    const gasWithAccessList = await publicClient.estimateGas({
        account,
        to: usdc.address,
        data,
        accessList: res.accessList,
    });
    console.log("Transfer with accessList gas:", gasWithAccessList);

    // 5️⃣ 实际执行交易（带 accessList）
    const hash = await walletClient.sendTransaction({
        to: usdc.address,
        data,
        accessList: res.accessList,
        gas: gasWithAccessList,
    });
    console.log("Tx sent:", hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Tx receipt gasUsed:", receipt.gasUsed);
}

main().catch(console.error);
