import {
	getSignerClient,
	generateAccount,
	getSignerClientByWallet,
	signerAddress,
	getContractClient,
	contractAddress,
	getContractClientByWallet,
	defaultCoordPubKey,
	stringizing,
} from './config';
import {
	GasPrice,
	calculateFee,
	MsgSendEncodeObject,
	SignerData,
} from '@cosmjs/stargate';
import { DirectSecp256k1HdWallet, OfflineSigner } from '@cosmjs/proto-signing';
import { HdPath, stringToPath } from '@cosmjs/crypto';
import { coins, makeCosmoshubPath } from '@cosmjs/amino';
import { AuthInfo, TxBody, TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { delay, setWhitelist } from '.';
import { genKeypair, Account } from './lib/circom';

import {
	MsgExecuteContractEncodeObject,
	SigningCosmWasmClient,
} from '@cosmjs/cosmwasm-stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { bech32 } from 'bech32';
import { PublicKey, batchGenMessage } from './lib/circom';

/**
 * 注册
 */
export async function signup(
	i: number,
	client: SigningCosmWasmClient,
	address: string,
	maciAccount: Account
) {
	const gasPrice = GasPrice.fromString('100000000000peaka');
	const fee = calculateFee(60000000, gasPrice);
	try {
		let res = await client.execute(
			address,
			contractAddress,
			{
				sign_up: {
					pubkey: {
						x: maciAccount.pubKey[0].toString(),
						y: maciAccount.pubKey[1].toString(),
					},
				},
			},
			fee
		);
		console.log(i, `signup hash ${res.transactionHash}`);
		return res;
	} catch (err: any) {
		console.log(err);
	}
}

/**
 * 投票
 */
export async function randomSubmitMsg(
	client: SigningCosmWasmClient,
	address: string,
	stateIdx: number,
	maciAccount: Account,
	coordPubKey: PublicKey = defaultCoordPubKey
) {
	/**
	 * 随机给一个项目投若干票
	 */
	const plan = [
		[Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)] as [
			number,
			number
		],
	];

	const payload = batchGenMessage(stateIdx, maciAccount, coordPubKey, plan);

	const msgs: MsgExecuteContractEncodeObject[] = payload.map(
		({ msg, encPubkeys }) => ({
			typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
			value: MsgExecuteContract.fromPartial({
				sender: address,
				contract: contractAddress,
				msg: new TextEncoder().encode(
					JSON.stringify(
						stringizing({
							publish_message: {
								enc_pub_key: {
									x: encPubkeys[0],
									y: encPubkeys[1],
								},
								message: {
									data: msg,
								},
							},
						})
					)
				),
			}),
		})
	);

	const gasPrice = GasPrice.fromString('100000000000peaka');
	const fee = calculateFee(20000000 * msgs.length, gasPrice);
	try {
		const result = await client.signAndBroadcast(address, msgs, fee);

		console.log(stateIdx, `pub_msg hash ${result.transactionHash}`);
		return result;
	} catch (err: any) {
		console.log(err);
		// await delay(16000);
	}
}

export async function batchSend(recipients: string[]) {
	const batchSize = 15;
	let client = await getSignerClient();

	const amount = coins('20000000000000000000', 'peaka'); // 20

	const gasPrice = GasPrice.fromString('100000000000peaka');

	for (let i = 0; i < recipients.length; i += batchSize) {
		const batchRecipients = recipients.slice(i, i + batchSize);
		let msgs: MsgSendEncodeObject[] = batchRecipients.map(recipient => {
			return {
				typeUrl: '/cosmos.bank.v1beta1.MsgSend',
				value: {
					fromAddress: signerAddress,
					toAddress: recipient,
					amount: amount,
				},
			};
		});

		const fee = calculateFee(50000 * msgs.length, gasPrice);
		const result = await client.signAndBroadcast(signerAddress, msgs, fee);
		console.log(`Faucet tx: ${result.transactionHash}`);

		await addWhitelist(batchRecipients);
	}
}

export async function testGrant(recipients: string[]) {
	const batchSize = 15;

	for (let i = 0; i < recipients.length; i += batchSize) {
		const batchRecipients = recipients.slice(i, i + batchSize);
		await grant(batchRecipients);
	}
}

export async function grant(recipients: string[]) {
	let client = await getContractClient();
	const gasPrice = GasPrice.fromString('100000000000peaka');
	const users = recipients.map(recipient => {
		return {
			addr: recipient,
			balance: '50',
		};
	});
	let result = await client.execute(
		signerAddress,
		contractAddress,
		{
			grant: {
				base_amount: '50000000000000000000',
				whitelists: {
					users,
				},
			},
		},
		'auto'
	);
	console.log(`fee_grant tx: ${result.transactionHash}`);
}

export async function addWhitelist(recipients: string[]) {
	let client = await getContractClient();
	const gasPrice = GasPrice.fromString('100000000000peaka');
	const users = recipients.map(recipient => {
		return {
			addr: recipient,
			balance: '50',
		};
	});
	let result = await client.execute(
		signerAddress,
		contractAddress,
		{
			set_whitelists: {
				whitelists: {
					users,
				},
			},
		},
		'auto'
	);
	console.log(`set_whitelists tx: ${result.transactionHash}`);
}

export async function multiBatchSend(signer: DirectSecp256k1HdWallet[]) {
	// const recipient = "dora12xkk5rrk6ex2j0yt6kelsqs6yg4nghax7fq924";
	for (let i = 0; i < signer.length; i++) {
		// let signer_client = await getSignerClientByWallet(signer[i]);
		let client = await getContractClientByWallet(signer[i]);

		let [{ address }] = await signer[i].getAccounts();

		// let maciAccount = genKeypair();
		let maciAccount: Account = {
			privKey:
				20998112427667807795414983364053796027037753339446011285430200813389155550260n,
			pubKey: [
				18162874740989776649659415206015074611002004817349811277327337518639243679492n,
				15243585339587983598168692459942850229544616568356930224643892620924755850757n,
			],
			formatedPrivKey:
				6579145933965452350468879105197507094030383123583244552573447491276099023871n,
		};
		// console.log(maciAccount);
		console.log(i);
		// try {
		// 	signup(i, client, address, maciAccount);
		// } catch {}
		// await delay(16000);
		try {
			randomSubmitMsg(client, address, i, maciAccount);
		} catch {}
		// let pub_msg = randomSubmitMsg(client, address, i, maciAccount);
		// console.log(i, `pub_msg hash ${pub_msg?.transactionHash}`);
	}
}

export async function benchmarkTest(start: number, thread: number) {
	// let thread = 10000;
	let accountAddresslist: string[] = [];
	let signerList: DirectSecp256k1HdWallet[] = [];
	(start = 1), (thread = 30);
	for (let i = start; i <= thread; i++) {
		let signer = await generateAccount(i);
		let accountDetail = await signer.getAccounts();
		accountAddresslist.push(accountDetail[0].address);
		signerList.push(signer);
	}
	console.log(accountAddresslist);

	// await batchSend(accountAddresslist);

	await testGrant(accountAddresslist);

	// multiBatchSend(signerList);
}
