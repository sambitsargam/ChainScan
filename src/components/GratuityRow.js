import { useState, useEffect, useRef } from 'react';
import { Bars } from 'react-loader-spinner';
import { ethers, constants } from 'ethers';
import useIsMounted from '@/lib/useIsMounted';
import toast from 'react-hot-toast';
import GratuityJSON from '@/lib/abis/Gratuity.json';
import {
	useContractRead,
	useContractWrite,
	usePrepareContractWrite,
	useWaitForTransaction,
	useContractEvent,
} from 'wagmi';

// Constants and ABI
const CONTRACT = '0x79ae3bbe30b86d22d759ead52e94dfa935583236';
const ATTESTATION_CONTRACT_ADDRESS = '0x878c92FD89d8E0B93Dc0a3c907A2adc7577e39c5'; // Replace with actual address
const ATTESTATION_ABI = GratuityJSON; // Replace with actual ABI

const contractAddressConfig = chainId => {
	const config = {
		11155111: {
			name: 'eth',
			address: CONTRACT,
		},
	};
	return config[chainId] || false;
};

const initialFormInput = {
	gratuityAmount: '0',
	message: '',
};

const initialAttestationInput = {
	name: '',
	email: '',
	address: ''
};

const GratuityRow = ({ address, chain }) => {
	const isMounted = useIsMounted();
	const [totalGratuity, setTotalGratuity] = useState(0);
	const [gratuityItems, setGratuityItems] = useState([]);
	const [attestedItems, setAttestedItems] = useState([]);
	const [formInput, updateFormInput] = useState(initialFormInput);
	const [attestationInput, setAttestationInput] = useState(initialAttestationInput);
	const [contractArgs, setContractArgs] = useState(initialFormInput);
	const depositFuncRef = useRef();

	// Contract Configuration
	const contractConfig = {
		address: contractAddressConfig(chain?.id)?.address || constants.AddressZero,
		abi: GratuityJSON.abi,
	};

	const [depositEnabled, setDepositEnabled] = useState(false);

	const { config: contractWriteConfig, status } = usePrepareContractWrite({
		...contractConfig,
		functionName: 'deposit',
		enabled: Boolean(depositEnabled),
		args: [contractArgs.message],
		overrides: {
			value: ethers.utils.parseEther(contractArgs.gratuityAmount),
		},
		onError: error => {
			console.log('Error prepare', error);
			setDepositEnabled(false);
		},
		onSuccess: data => {
			setTimeout(() => {
				depositGratuity();
			}, 1000);
		},
	});

	const {
		data: depositData,
		writeAsync: deposit,
		isLoading: depositLoading,
		isSuccess: depositSuccess,
		error: depositError,
	} = useContractWrite(contractWriteConfig);

	const {
		data: txData,
		isSuccess: txSuccess,
		error: txError,
	} = useWaitForTransaction({
		hash: depositData?.hash,
	});

	useEffect(() => {
		if (depositSuccess && txSuccess && !txError && txData) {
			const link = `${chain.blockExplorers.default.url}/tx/${txData.transactionHash}`;
			toast.success(
				<span>
					Deposit transaction succeeded! View your transaction here:{' '}
					<a href={link} target="_blank" rel="noreferrer noopener">
						{link}
					</a>
				</span>,
				{
					style: { 'word-break': 'break-all' },
				}
			);
		}
	}, [txData, depositSuccess, txSuccess, txError]);

	useEffect(() => {
		if (deposit && typeof deposit === 'function') {
			depositFuncRef.current = deposit;
		}
	}, [deposit]);

	useContractEvent({
		...contractConfig,
		eventName: 'GratuityItemGifted',
		listener: event => {
			console.log('LOG: event', event);
			reset();
		},
	});

	useContractRead({
		...contractConfig,
		functionName: 'getTotalGratuity',
		enabled: address,
		watch: true,
		onSuccess: data => {
			setTotalGratuity(ethers.utils.formatEther(data));
		},
		onError: async error => {
			console.log('LOG: contract read error getTotalGratuity', error);
		},
	});

	useContractRead({
		...contractConfig,
		functionName: 'getAllGratuityItems',
		enabled: address,
		watch: true,
		onSuccess: async data => {
			const items = await formatGratuityItems(data);
			setGratuityItems(items);
		},
		onError: async error => {
			console.log('LOG: contract read error getAllGratuityItems', error);
		},
	});

	const depositGratuity = async () => {
		try {
			await depositFuncRef.current();
		} catch (error) {
			const msg =
				error?.code === 'ACTION_REJECTED'
					? 'Transaction was denied!'
					: `Transaction failed! Code: ${error.code}`;
			toast.error(msg);
			console.log('LOG: error deposit', error.code, JSON.stringify(error));
			reset();
		}
	};

	const toggleDeposit = async () => {
		try {
			const { gratuityAmount, message } = formInput;
			if (!gratuityAmount || !message) return;

			setContractArgs({
				gratuityAmount,
				message,
			});
			setDepositEnabled(true);
		} catch (e) {
			console.log('LOG: deposit error', e);
		}
	};

	const formatGratuityItems = async data => {
		const items = await Promise.all(
			data.map(async i => {
				let item = {
					amount: ethers.utils.formatEther(i.amount),
					sender: i.sender,
					message: i.message,
				};
				return item;
			})
		);
		const reversedItems = [...items].reverse();
		return reversedItems;
	};

	const handleAttestation = async () => {
		try {
			const { name, email, address } = attestationInput;
			if (!name || !email || !address) return;

			await createNotaryAttestation(name, address);
		} catch (error) {
			toast.error('Attestation failed!');
			console.log('LOG: error attestation', error);
		}
	};

	const createNotaryAttestation = async (name, address) => {
		const schemaData = ethers.utils.defaultAbiCoder.encode(
			["string", "address"],
			[name, address]
		);

		const provider = new ethers.providers.JsonRpcProvider(getProviderUrl(chain.id));
		const contract = new Contract(ATTESTATION_CONTRACT_ADDRESS, ATTESTATION_ABI, provider);
		const library = new Web3Provider(await connector.getProvider());
		const instance = contract.connect(library.getSigner() || library.getSigner(0));

		try {
			await instance[
				"attest((uint64,uint64,uint64,uint64,address,uint64,uint8,bool,bytes[],bytes),string,bytes,bytes)"
			](
				{
					schemaId: BigNumber.from("idd"),
					linkedAttestationId: 0,
					attestTimestamp: 0,
					revokeTimestamp: 0,
					attester: address,
					validUntil: 0,
					dataLocation: 0,
					revoked: false,
					recipients: [address],
					data: schemaData
				},
				address.toLowerCase(),
				"0x",
				"0x00"
			)
			.then(async tx => await tx.wait(1))
			.then(res => {
				console.log("Attestation success", res);
				toast.success('Attestation succeeded!');
			})
			.catch(err => {
				console.log('Attestation error', err);
				toast.error('Attestation failed!');
			});
		} catch (err) {
			console.log('Attestation error', err);
		}
	};

	const reset = () => {
		setDepositEnabled(false);
		setContractArgs(initialFormInput);
		updateFormInput(initialFormInput);
		setAttestationInput(initialAttestationInput);
		depositFuncRef.current = null;
	};

	return (
		<>
			{/* Gratuity Section */}
			<div className="shadow-lg card compact bg-base-100">
				<div className="card-body">
					<div className="card-title">Like this dashboard? Send a tip!</div>
					{isMounted && depositLoading && !depositError && (
						<div className="flex items-center justify-center mt-8">
							<Bars height="100" width="100" color="grey" ariaLabel="bars-loading" />
						</div>
					)}
					{!isMounted && <p>Loading...</p>}
					{!depositLoading && !depositError && (
						<div className="flex flex-col space-y-4">
							<input
								type="text"
								value={formInput.gratuityAmount}
								onChange={e => updateFormInput({ ...formInput, gratuityAmount: e.target.value })}
								placeholder="Gratuity Amount (ETH)"
								className="input input-bordered w-full"
							/>
							<textarea
								value={formInput.message}
								onChange={e => updateFormInput({ ...formInput, message: e.target.value })}
								placeholder="Message"
								className="textarea textarea-bordered w-full"
							/>
							<button
								className="btn btn-primary"
								onClick={toggleDeposit}
							>
								{status === 'loading' ? 'Loading...' : 'Send Gratuity'}
							</button>
						</div>
					)}
					{depositError && (
						<p className="text-red-600">Transaction failed: {depositError.message}</p>
					)}
				</div>
			</div>

			{/* Attestation Section */}
			<div className="shadow-lg card compact bg-base-100 mt-8">
				<div className="card-body">
					<div className="card-title">Create an Attestation</div>
					<div className="flex flex-col space-y-4">
						<input
							type="text"
							value={attestationInput.name}
							onChange={e => setAttestationInput({ ...attestationInput, name: e.target.value })}
							placeholder="Name"
							className="input input-bordered w-full"
						/>
						<input
							type="email"
							value={attestationInput.email}
							onChange={e => setAttestationInput({ ...attestationInput, email: e.target.value })}
							placeholder="Email"
							className="input input-bordered w-full"
						/>
						<input
							type="text"
							value={attestationInput.address}
							onChange={e => setAttestationInput({ ...attestationInput, address: e.target.value })}
							placeholder="Address"
							className="input input-bordered w-full"
						/>
						<button
							className="btn btn-primary"
							onClick={handleAttestation}
						>
							Create Attestation
						</button>
					</div>
				</div>
			</div>

			{/* Attested Items Tab */}
			<div className="shadow-lg card compact bg-base-100 mt-8">
				<div className="card-body">
					<div className="card-title">Attested Items</div>
					{/* Render attested items */}
					{attestedItems.length > 0 ? (
						<ul className="list-disc pl-5">
							{attestedItems.map((item, index) => (
								<li key={index}>
									<p>Name: {item.name}</p>
									<p>Email: {item.email}</p>
									<p>Address: {item.address}</p>
								</li>
							))}
						</ul>
					) : (
						<p>No attested items yet.</p>
					)}
				</div>
			</div>
		</>
	);
};

export default GratuityRow;
