import { useState, useEffect } from 'react';
import axios from 'axios';
import useInterval from './useInterval';

const useFetchPrice = (config = {}) => {
	const { delayInterval = 20000 } = config;
	const [price, setPrice] = useState();
	const [delay, setDelay] = useState(delayInterval);

	// TODO: show value of eth in wallet in usd
	// https://github.com/MetaMask/metamask-extension/blob/b073b04789524a5cdb01e1fc2f0dfcf945b70137/ui/hooks/useCurrencyDisplay.js
	const fetchPrice = async () => {
		try {
		  const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
		  const Price = response?.data?.['ethereum']?.usd;
		  console.log(Price);
		  setPrice(Price);
		} catch (err) {
		  setPrice(null);
		  setDelay(null);
		}
	  };

	useInterval(() => {
		fetchPrice();
	}, delay);

	useEffect(() => {
		fetchPrice();
	}, []);

	return {
		price,
	};
};

export default useFetchPrice;
