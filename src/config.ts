import { Secp256k1HdWallet } from '@cosmjs/launchpad';
import { DirectSecp256k1HdWallet, OfflineSigner } from '@cosmjs/proto-signing';
import {
	GasPrice,
	SigningStargateClient,
	SigningStargateClientOptions,
} from '@cosmjs/stargate';
import {
	SigningCosmWasmClient,
	SigningCosmWasmClientOptions,
} from '@cosmjs/cosmwasm-stargate';
import { HdPath, stringToPath } from '@cosmjs/crypto';
import * as dotenv from 'dotenv';
dotenv.config();

// export const rpcEndpoint = "https://vota-rpc.dorafactory.org";
// export const restEndpoint = "https://vota-rest.dorafactory.org";
// export const chainId = "vota-ash";

export const rpcEndpoint = 'https://vota-testnet-rpc.dorafactory.org';
export const restEndpoint = 'https://vota-testnet-rest.dorafactory.org';

// export const rpcEndpoint = 'http://127.0.0.1:26657';
// export const restEndpoint = 'http://127.0.0.1:1317';
export const chainId = 'vota-testnet';
export const prefix = 'dora';

// export const mnemonic = // dora1t58t7azqzq26406uwehgnfekal5kzym3m9lz4k

export const signerAddress = 'dora12zkrfca99mgavvj4mraxnra3mdarpggljzp8k8';
export const contractAddress =
	'dora1x8gwn06l85q0lyncy7zsde8zzdn588k2dck00a8j6lkprydcutwqtlh33s';

/** Setting to speed up testing */
const defaultSigningClientOptions: SigningStargateClientOptions = {
	broadcastPollIntervalMs: 8_000,
	broadcastTimeoutMs: 16_000,
	gasPrice: GasPrice.fromString('100000000000peaka'),
};

export async function getSignerClient() {
	const mnemonic = process.env.MNEMONIC;

	if (mnemonic === undefined) {
		console.log('Missing MNEMONIC in .env');
		process.exit(0);
	}
	const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
		prefix,
	});
	const signingStargateClient = await SigningStargateClient.connectWithSigner(
		rpcEndpoint,
		wallet,
		{
			...defaultSigningClientOptions,
		}
	);
	return signingStargateClient;
}

export async function getContractClient() {
	const mnemonic = process.env.MNEMONIC;

	if (mnemonic === undefined) {
		console.log('Missing MNEMONIC in .env');
		process.exit(0);
	}
	const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
		prefix,
	});
	const client = await SigningCosmWasmClient.connectWithSigner(
		rpcEndpoint,
		wallet,
		{
			...defaultSigningClientOptions,
		}
	);
	return client;
}

export async function getSignerClientByWallet(wallet: DirectSecp256k1HdWallet) {
	const signingStargateClient = await SigningStargateClient.connectWithSigner(
		rpcEndpoint,
		wallet,
		{
			...defaultSigningClientOptions,
		}
	);
	return signingStargateClient;
}

export async function generateAccount(index: number) {
	const mnemonic = process.env.MNEMONIC;

	if (mnemonic === undefined) {
		console.log('Missing MNEMONIC in .env');
		process.exit(0);
	}

	const path: HdPath = stringToPath(
		"m/44'/" + '118' + "'/0'/0/" + index.toString()
	);
	const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
		prefix,
		hdPaths: [path],
	});

	return wallet;
	// return await DirectSecp256k1HdWallet.generate(24, { prefix });
}

type MixedData<T> = T | Array<MixedData<T>> | { [key: string]: MixedData<T> };

export const stringizing = (
	o: MixedData<bigint>,
	path: MixedData<bigint>[] = []
): MixedData<string> => {
	if (path.includes(o)) {
		throw new Error('loop nesting!');
	}
	const newPath = [...path, o];

	if (Array.isArray(o)) {
		return o.map(item => stringizing(item, newPath));
	} else if (typeof o === 'object') {
		const output: { [key: string]: MixedData<string> } = {};
		for (const key in o) {
			output[key] = stringizing(o[key], newPath);
		}
		return output;
	} else {
		return o.toString();
	}
};