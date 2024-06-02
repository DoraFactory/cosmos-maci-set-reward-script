import { Client } from 'pg';
import fs from 'fs';
import {
	getSignerClient,
	generateAccount,
	getSignerClientByWallet,
	contractAddress,
	signerAddress,
	stringizing,
	getContractClient,
	defaultCoordPubKey,
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
import {
	MsgExecuteContractEncodeObject,
	SigningCosmWasmClient,
} from '@cosmjs/cosmwasm-stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { bech32 } from 'bech32';
import { Account, PublicKey, batchGenMessage } from './lib/circom';

// 创建一个PostgreSQL客户端实例
const client = new Client({
	user: 'postgres', // 替换为你的数据库用户名
	host: 'localhost', // 替换为你的数据库主机名
	database: 'postgres', // 替换为你的数据库名
	password: 'postgres', // 替换为你的数据库密码
	port: 5432, // 替换为你的数据库端口
});

type DelegatorData = {
	id: number;
	delegator_address: string;
	amount: string;
	dora_address: string | undefined;
	credit_amount: number | undefined;
	airdrop_amount: number | undefined;
	update: Date;
};

export const delay = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

function formatDelegationAmount(amount: string) {
	const amountNum = parseFloat(amount) / 1000000;

	if (isNaN(amountNum)) {
		throw new Error('Invalid number format');
	}
	return Math.ceil(amountNum);
}

function formatAirdropAmount(amount: string) {
	const amountNum = parseFloat(amount) / 1000000;

	if (isNaN(amountNum)) {
		throw new Error('Invalid number format');
	}

	if (amountNum < 0.5) {
		return 0.03;
	} else if (amountNum < 5) {
		return 0.2;
	} else if (amountNum < 10) {
		return 0.5;
	} else {
		return 1;
	}
}

function convertBech32Prefix(address: string, newPrefix: string): string {
	// Decode the original address
	const decoded = bech32.decode(address);

	// Encode the address with the new prefix
	const newAddress = bech32.encode(newPrefix, decoded.words);

	return newAddress;
}

// 读取进度
function readProgress(limit: number): { offset: number; limit: number } {
	try {
		const data = fs.readFileSync('progress.json', 'utf8');
		return JSON.parse(data);
	} catch (error) {
		// 如果文件不存在或者读取出错，则返回默认值
		return { offset: 0, limit };
	}
}

// 保存进度
function saveProgress(offset: number, limit: number): void {
	const data = JSON.stringify({ offset, limit });
	fs.writeFileSync('progress.json', data);
}

// 定义一个异步函数来执行查询
async function queryDelegation(limit: number, offset: number) {
	// 执行查询
	const res = await client.query(
		`SELECT * FROM delegations ORDER BY id ASC LIMIT ${limit} OFFSET ${offset}`
	);

	let delegators: DelegatorData[] = res.rows;
	delegators.forEach((delegator) => {
		let dora_address = convertBech32Prefix(delegator.delegator_address, 'dora');
		let credit_amount = formatDelegationAmount(delegator.amount);
		let airdrop_amount = formatAirdropAmount(delegator.amount);

		delegator.dora_address = dora_address;
		delegator.credit_amount = credit_amount;
		delegator.airdrop_amount = airdrop_amount;

		// console.log(delegator.amount = )
	});
	let date = new Date();
	console.log(offset, delegators.length, date.toLocaleString());
	//
	// 设置白名单的交易脚本需要放在这里。
	// await batchSend(delegators);
	await setWhitelist(delegators);
	//
	// console.log(delegators);
	saveProgress(offset + limit, limit);

	await delay(1000);
}

async function queryCount() {
	// try {
	// 执行查询
	const res = await client.query(`SELECT COUNT(*) FROM delegations`);
	// 打印查询结果
	console.log(res.rows[0].count);
	delay(1000);

	return res.rows[0].count;
	// for
	// } catch (err) {
	// 	// 将 err 类型显式地转换为 Error
	// 	if (err instanceof Error) {
	// 		console.error('Error executing query', err.stack);
	// 	} else {
	// 		console.error('Unexpected error', err);
	// 	}
	// 	// } finally {
	// 	// 	// 断开与数据库的连接
	// 	// 	await client.end();
	// }
}

export async function setWhitelist(recipients: DelegatorData[]) {
	let client = await getContractClient();
	const gasPrice = GasPrice.fromString('100000000000peaka');
	const users = recipients.map((recipient) => {
		return {
			addr: recipient.dora_address!,
			balance: recipient.credit_amount!.toString(),
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

export async function batchSend(recipients: DelegatorData[]) {
	const batchSize = 1500;
	let client = await getSignerClient();

	const gasPrice = GasPrice.fromString('100000000000peaka');

	for (let i = 0; i < recipients.length; i += batchSize) {
		const batchRecipients = recipients.slice(i, i + batchSize);

		let msgs: MsgSendEncodeObject[] = batchRecipients.map((recipient) => {
			return {
				typeUrl: '/cosmos.bank.v1beta1.MsgSend',
				value: {
					fromAddress: signerAddress,
					toAddress: recipient.dora_address!,
					amount: coins(
						(recipient.airdrop_amount! * 10 ** 18).toString(),
						'peaka'
					),
				},
			};
		});

		const fee = calculateFee(50000 * msgs.length, gasPrice);
		const result = await client.signAndBroadcast(signerAddress, msgs, fee);
		console.log(`Airdrop tx: ${result.transactionHash}`);
	}
}

/**
 * 注册
 */
export async function signup(
	client: SigningCosmWasmClient,
	address: string,
	maciAccount: Account
) {
	return client.execute(
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
		'auto'
	);
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

	return client.signAndBroadcast(address, msgs, fee);
}

async function main() {
	// let dora_address = convertBech32Prefix(
	// 	'cosmos1t58t7azqzq26406uwehgnfekal5kzym3cl60zq',
	// 	'dora'
	// );

	// console.log(dora_address);

	try {
		// 连接到数据库
		await client.connect();

		const { offset, limit } = readProgress(1000);
		const total = await queryCount();

		for (
			let currentOffset = offset;
			currentOffset < total;
			currentOffset += limit
		) {
			await queryDelegation(limit, currentOffset);
		}
	} catch (err) {
		// 将 err 类型显式地转换为 Error
		if (err instanceof Error) {
			console.error('Error executing query', err.stack);
		} else {
			console.error('Unexpected error', err);
		}
		// 断开与数据库的连接
		await client.end();
	}
}

// 调用主函数
main();
