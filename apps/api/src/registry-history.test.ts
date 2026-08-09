import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import {
  mergeRegistryRecords,
  registryHistorySnapshot,
  type RegistryHistoryRecord,
  uniqueHttpsRpcUrls,
} from "./registry-history.js";

function record(
  transactionHash: Hex,
  issuedAt: number,
): RegistryHistoryRecord {
  return {
    transactionHash,
    registryAddress: "0xb5bdc630f78BEB587235C42e4fD4b6c67Fd1d65a" as Address,
    assetAddress: "0xE821F58B1F393A46cc3Cd9ba420A19c2ef62a2ec" as Address,
    commitment: `0x${"1".repeat(64)}` as Hex,
    nullifier: `0x${"2".repeat(64)}` as Hex,
    issuer: "0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4" as Address,
    issuedAt,
    blockNumber: String(issuedAt),
    explorerUrl: `https://testnet.monadvision.com/tx/${transactionHash}`,
  };
}

test("RPC configuration keeps unique HTTPS providers in priority order", () => {
  assert.deepEqual(
    uniqueHttpsRpcUrls([
      "https://primary.example/rpc",
      "http://unsafe.example/rpc",
      "not-a-url",
      "https://primary.example/rpc",
      "https://fallback.example/rpc",
    ]),
    ["https://primary.example/rpc", "https://fallback.example/rpc"],
  );
});

test("durable registry records survive refreshes without duplicates", () => {
  const older = record(`0x${"a".repeat(64)}` as Hex, 10);
  const newer = record(`0x${"b".repeat(64)}` as Hex, 20);
  assert.deepEqual(
    mergeRegistryRecords([older], [newer, older]),
    [newer, older],
  );
});

test("the confirmed registry checkpoint is available without an RPC scan", () => {
  const snapshot = registryHistorySnapshot();
  assert.equal(snapshot.records.length, 2);
  assert.equal(
    snapshot.records[0].assetAddress,
    "0xE821F58B1F393A46cc3Cd9ba420A19c2ef62a2ec",
  );
});

test("the original deployer receipt is available without an RPC scan", () => {
  const snapshot = registryHistorySnapshot(
    "0xC6CFa54eDA215a62fD5495A9B6555Bd85b6B7ddB" as Address,
  );
  assert.equal(snapshot.records.length, 1);
  assert.equal(
    snapshot.records[0].transactionHash,
    "0xd18129eda099b71db87e84bf8c72f0c8724f945ba49467824c9e0a16acc7c586",
  );
});
