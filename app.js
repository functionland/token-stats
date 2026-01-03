// Contract Addresses
const FULA_TOKEN_ADDRESS = '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB';
const STAKING_POOL_1 = '0xb2064743e3da40bB4C18e80620A02a38e87fB145';
const STAKING_POOL_2 = '0x4E875E0A4fEa97E83f1350b63420c36e38241db4';

// Base Network RPC URLs (fallbacks) - order matters, most reliable first
const RPC_URLS = [
    'https://base.publicnode.com',
    'https://rpc.ankr.com/base',
    'https://base.meowrpc.com',
    'https://base.gateway.tenderly.co',
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
    'https://base-mainnet.public.blastapi.io'
];

// Total initial supply (500M FULA)
const INITIAL_SUPPLY = BigInt('500000000000000000000000000'); // 500M with 18 decimals

// Lock periods in seconds (matching contract constants)
const LOCK_PERIOD_1 = 180 * 24 * 60 * 60; // 180 days
const LOCK_PERIOD_2 = 365 * 24 * 60 * 60; // 365 days
const LOCK_PERIOD_3 = 730 * 24 * 60 * 60; // 730 days

// ABIs (minimal, only what we need)
const ERC20_ABI = [
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function name() view returns (string)',
    'function symbol() view returns (string)'
];

// ABI for Pool 1 (180/365/730/1095 days)
const STAKING_ABI_POOL1 = [
    'function totalStaked() view returns (uint256)',
    'function totalStaked180Days() view returns (uint256)',
    'function totalStaked365Days() view returns (uint256)',
    'function totalStaked730Days() view returns (uint256)',
    'function totalStaked1095Days() view returns (uint256)',
    'function stakePool() view returns (address)',
    'function rewardPool() view returns (address)'
];

// ABI for Pool 2 (90/180/365 days)
const STAKING_ABI_POOL2 = [
    'function totalStaked() view returns (uint256)',
    'function totalStaked90Days() view returns (uint256)',
    'function totalStaked180Days() view returns (uint256)',
    'function totalStaked365Days() view returns (uint256)',
    'function stakePool() view returns (address)',
    'function rewardPool() view returns (address)'
];

// Non-circulating addresses (holdings that don't enter circulation unless action happens)
const NON_CIRCULATING_ADDRESSES = [
    '0x0C85A8E992E3Eb04A22027F7E0BC53392A331aC8',
    '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB', // Token address holds tokens
    '0x1DE28ED80909a5f83E28cdc0AdCE77aCC16ac0eD',
    '0x8adbB0b58D582ac8286703a37E9DecB40E1b68dC',
    '0xE2d6ffa971c8F1fc2400Fa7467bce09D151e3091',
    '0xDba39B6721f54997D0a91e0DeA7Bc4883721DEd8',
    '0x62911Cc86dE4eBDe4c0045100427c625410E3Ddb',
    '0x1Def7229f6d6Ca5fbA4f9e28Cd1cf4e2688e545d',
    '0xDEA9B8EB61349f0C5a378f448A61836C62C6aFB3',
    '0x03Aaca62F138670E77c92AAD65d4993732310c16',
    '0x92c7D86f573B7C0071EC8f9E5252799c5c2c0545',
    '0xDB2ab8De23eb8dd6cd12127673be9ae6Ae6edd9A',
];

// Burn addresses
const BURN_ADDRESSES = [
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dEaD',
];

let provider;
let currentRpcIndex = 0;

// Initialize provider with fallback support
async function initProvider() {
    for (let i = 0; i < RPC_URLS.length; i++) {
        const rpcUrl = RPC_URLS[(currentRpcIndex + i) % RPC_URLS.length];
        try {
            // Create provider with batching disabled
            const newProvider = new ethers.JsonRpcProvider(rpcUrl, 8453, {
                staticNetwork: true,
                batchMaxCount: 1 // Disable batching
            });
            
            // Test the connection with a simple call
            await newProvider.getBlockNumber();
            
            provider = newProvider;
            currentRpcIndex = (currentRpcIndex + i) % RPC_URLS.length;
            console.log(`Connected to RPC: ${rpcUrl}`);
            return true;
        } catch (error) {
            console.warn(`RPC ${rpcUrl} failed:`, error.message);
        }
    }
    throw new Error('All RPC endpoints failed');
}

// Helper function to make a single call with retry
async function safeCall(contract, method, args = []) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await contract[method](...args);
            return result;
        } catch (error) {
            console.warn(`Call ${method} attempt ${attempt + 1} failed:`, error.message);
            if (attempt < maxRetries - 1) {
                // Try next RPC
                currentRpcIndex = (currentRpcIndex + 1) % RPC_URLS.length;
                await initProvider();
            } else {
                throw error;
            }
        }
    }
}

// Format number with commas and specified decimals
function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined) return '-';
    
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    
    if (num >= 1e9) {
        return (num / 1e9).toFixed(decimals) + 'B';
    } else if (num >= 1e6) {
        return (num / 1e6).toFixed(decimals) + 'M';
    } else if (num >= 1e3) {
        return (num / 1e3).toFixed(decimals) + 'K';
    }
    
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

// Format token amount from wei
function formatTokenAmount(weiAmount, decimals = 18) {
    if (weiAmount === null || weiAmount === undefined) return 0;
    // Convert decimals to Number if it's BigInt
    const dec = typeof decimals === 'bigint' ? Number(decimals) : decimals;
    // Convert BigInt to string first, then to number for division
    const amount = Number(weiAmount.toString()) / Math.pow(10, dec);
    return amount;
}

// Update DOM element with value or error
function updateElement(id, value, isError = false, isHTML = false) {
    const element = document.getElementById(id);
    if (!element) return;
    
    if (isError) {
        element.innerHTML = `<span class="error-value">${value}</span>`;
    } else if (isHTML || value.includes('<a ')) {
        element.innerHTML = value;
    } else {
        element.textContent = value;
    }
}

// Fetch token data - sequential calls to avoid batch limits
async function fetchTokenData() {
    try {
        const tokenContract = new ethers.Contract(FULA_TOKEN_ADDRESS, ERC20_ABI, provider);
        
        // Make sequential calls to avoid RPC batch limits
        const totalSupply = await tokenContract.totalSupply();
        const decimals = await tokenContract.decimals();

        // Calculate burned tokens from burn addresses
        let burned = BigInt(0);
        for (const addr of BURN_ADDRESSES) {
            try {
                const balance = await tokenContract.balanceOf(addr);
                burned += balance;
                console.log(`Burn address ${addr}: ${formatTokenAmount(balance)} FULA`);
            } catch (e) {
                console.warn(`Could not fetch burn balance for ${addr}`);
            }
        }
        // Also add the difference from initial supply (tokens burned via other means)
        const supplyBurned = INITIAL_SUPPLY - totalSupply;
        burned += supplyBurned;

        updateElement('totalSupply', formatNumber(formatTokenAmount(totalSupply, decimals)) + ' FULA');
        updateElement('burnedTokens', formatNumber(formatTokenAmount(burned, decimals)) + ' FULA');

        // Get non-circulating balances (wallets that hold tokens not in circulation)
        let nonCirculating = BigInt(0);
        console.log('Fetching non-circulating wallet balances...');
        for (const addr of NON_CIRCULATING_ADDRESSES) {
            try {
                const balance = await tokenContract.balanceOf(addr);
                nonCirculating += balance;
                console.log(`Non-circulating ${addr.slice(0,8)}...: ${formatNumber(formatTokenAmount(balance))} FULA`);
            } catch (e) {
                console.warn(`Could not fetch balance for ${addr}`);
            }
        }
        console.log(`Total non-circulating: ${formatNumber(formatTokenAmount(nonCirculating))} FULA`);

        return {
            totalSupply,
            decimals,
            burned,
            nonCirculating
        };
    } catch (error) {
        console.error('Error fetching token data:', error);
        updateElement('totalSupply', 'Error loading', true);
        updateElement('burnedTokens', 'Error loading', true);
        throw error;
    }
}

// Fetch staking data for Pool 1 (180/365/730 days) - try ALL RPCs
async function fetchStakingDataPool1(poolAddress) {
    const iface = new ethers.Interface(STAKING_ABI_POOL1);
    
    // Try each RPC until we find one that works for this contract
    for (const rpcUrl of RPC_URLS) {
        try {
            console.log(`Pool 1: Trying RPC ${rpcUrl}...`);
            
            // Check if contract code exists on this RPC
            const codeResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getCode',
                    params: [poolAddress, 'latest']
                })
            });
            const codeJson = await codeResponse.json();
            
            if (!codeJson.result || codeJson.result === '0x' || codeJson.result.length < 10) {
                console.log(`Pool 1: ${rpcUrl} - no contract code`);
                continue;
            }
            
            console.log(`Pool 1: ${rpcUrl} - contract found (${codeJson.result.length} chars)`);
            
            // Try to read totalStaked
            const callResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_call',
                    params: [{ to: poolAddress, data: iface.encodeFunctionData('totalStaked') }, 'latest']
                })
            });
            const callJson = await callResponse.json();
            
            if (callJson.result && callJson.result !== '0x' && callJson.result.length > 2) {
                const totalStaked = BigInt(callJson.result);
                console.log(`Pool 1: ${rpcUrl} - totalStaked = ${totalStaked.toString()}`);
                
                // This RPC works! Fetch 365, 730, and 1095 days data
                const resp365 = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: poolAddress, data: iface.encodeFunctionData('totalStaked365Days') }, 'latest'] }) });
                const json365 = await resp365.json();
                
                const resp730 = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: poolAddress, data: iface.encodeFunctionData('totalStaked730Days') }, 'latest'] }) });
                const json730 = await resp730.json();

                const resp1095 = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: poolAddress, data: iface.encodeFunctionData('totalStaked1095Days') }, 'latest'] }) });
                const json1095 = await resp1095.json();
                
                const staked365Days = json365.result && json365.result !== '0x' ? BigInt(json365.result) : BigInt(0);
                const staked730Days = json730.result && json730.result !== '0x' ? BigInt(json730.result) : BigInt(0);
                const staked1095Days = json1095.result && json1095.result !== '0x' ? BigInt(json1095.result) : BigInt(0);

                console.log('Pool 1 data:', { totalStaked: totalStaked.toString(), staked365Days: staked365Days.toString(), staked730Days: staked730Days.toString() });

                updateElement('pool1-365days', formatNumber(formatTokenAmount(staked365Days)) + ' FULA');
                updateElement('pool1-730days', formatNumber(formatTokenAmount(staked730Days)) + ' FULA');
                updateElement('pool1-1095days', formatNumber(formatTokenAmount(staked1095Days)) + ' FULA');
                updateElement('pool1-total', formatNumber(formatTokenAmount(totalStaked)) + ' FULA');

                return { totalStaked, staked90Days: BigInt(0), staked180Days: BigInt(0), staked365Days, staked730Days, staked1095Days };
            }
        } catch (e) {
            console.warn(`Pool 1: ${rpcUrl} error:`, e.message);
        }
    }
    
    // All RPCs failed
    console.error('Pool 1: All RPCs failed to return data');
    updateElement('pool1-180days', 'RPC error', true);
    updateElement('pool1-365days', 'RPC error', true);
    updateElement('pool1-730days', 'RPC error', true);
    updateElement('pool1-total', 'RPC error', true);
    
    return { totalStaked: BigInt(0), staked90Days: BigInt(0), staked180Days: BigInt(0), staked365Days: BigInt(0), staked730Days: BigInt(0), staked1095Days: BigInt(0) };
}

// Fetch staking data for Pool 2 (90/180/365 days) - sequential calls to avoid batch limits
async function fetchStakingDataPool2(poolAddress) {
    try {
        const stakingContract = new ethers.Contract(poolAddress, STAKING_ABI_POOL2, provider);
        
        // Make sequential calls to avoid RPC batch limits
        const totalStaked = await stakingContract.totalStaked();
        const staked90Days = await stakingContract.totalStaked90Days();
        const staked180Days = await stakingContract.totalStaked180Days();
        const staked365Days = await stakingContract.totalStaked365Days();

        updateElement('pool2-90days', formatNumber(formatTokenAmount(staked90Days)) + ' FULA');
        updateElement('pool2-180days', formatNumber(formatTokenAmount(staked180Days)) + ' FULA');
        updateElement('pool2-365days', formatNumber(formatTokenAmount(staked365Days)) + ' FULA');
        updateElement('pool2-total', formatNumber(formatTokenAmount(totalStaked)) + ' FULA');

        return {
            totalStaked,
            staked90Days,
            staked180Days,
            staked365Days,
            staked730Days: BigInt(0)
        };
    } catch (error) {
        console.error('Error fetching staking data for pool2:', error);
        updateElement('pool2-90days', 'Error', true);
        updateElement('pool2-180days', 'Error', true);
        updateElement('pool2-365days', 'Error', true);
        updateElement('pool2-total', 'Error', true);
        
        return {
            totalStaked: BigInt(0),
            staked90Days: BigInt(0),
            staked180Days: BigInt(0),
            staked365Days: BigInt(0),
            staked730Days: BigInt(0)
        };
    }
}

// Update combined statistics
function updateCombinedStats(pool1Data, pool2Data, tokenData) {
    // Pool 1: 365/730/1095 days, Pool 2: 90/180/365 days
    const total90 = pool2Data.staked90Days; // Only Pool 2 has 90 days
    const total180 = pool2Data.staked180Days; // Only Pool 2 has 180 days now
    const total365 = pool1Data.staked365Days + pool2Data.staked365Days;
    const total730 = pool1Data.staked730Days; // Only Pool 1 has 730 days
    const total1095 = pool1Data.staked1095Days; // Currently only Pool 1 has 1095 days
    const totalAllPools = pool1Data.totalStaked + pool2Data.totalStaked;

    updateElement('all-90days', formatNumber(formatTokenAmount(total90)) + ' FULA');
    updateElement('all-180days', formatNumber(formatTokenAmount(total180)) + ' FULA');
    updateElement('all-365days', formatNumber(formatTokenAmount(total365)) + ' FULA');
    updateElement('all-730days', formatNumber(formatTokenAmount(total730)) + ' FULA');
    updateElement('all-1095days', formatNumber(formatTokenAmount(total1095)) + ' FULA');
    updateElement('allPools-total', formatNumber(formatTokenAmount(totalAllPools)) + ' FULA');

    // Calculate circulating supply
    // Circulating = Total Supply - Non-Circulating Holdings
    if (tokenData && tokenData.totalSupply) {
        const circulatingSupply = tokenData.totalSupply - tokenData.nonCirculating;
        console.log(`Circulating Supply: ${formatNumber(formatTokenAmount(circulatingSupply))} FULA`);
        console.log(`  Total Supply: ${formatNumber(formatTokenAmount(tokenData.totalSupply))}`);
        console.log(`  Non-Circulating: ${formatNumber(formatTokenAmount(tokenData.nonCirculating))}`);
        updateElement('circulatingSupply', formatNumber(formatTokenAmount(circulatingSupply, tokenData.decimals)) + ' FULA');
    }
}

// Fetch token holders count from Basescan with 1-hour caching
async function fetchHoldersCount() {
    const CACHE_KEY = 'fula_holders_cache';
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

    // Check cache first
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { holders, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION) {
                console.log(`Using cached holders count: ${holders} (cached ${Math.round(age / 60000)} minutes ago)`);
                updateElement('holdersCount', holders.toLocaleString('en-US'));
                return;
            }
            console.log('Cache expired, fetching fresh data...');
        }
    } catch (e) {
        console.warn('Error reading holders cache:', e);
    }

    // Fetch fresh data from Basescan
    try {
        const response = await fetch(`https://basescan.org/token/${FULA_TOKEN_ADDRESS}`, {
            headers: {
                'Accept': 'text/html'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const html = await response.text();

        // Parse holdersplotData from the HTML to get the latest holder count
        const match = html.match(/var\s+holdersplotData\s*=\s*\[([\s\S]*?)\];/);
        if (match) {
            // Extract all y values and get the last one (most recent holder count)
            const yMatches = [...match[1].matchAll(/y:\s*(\d+)/g)];
            if (yMatches.length > 0) {
                const lastHolderCount = parseInt(yMatches[yMatches.length - 1][1], 10);

                if (lastHolderCount > 0) {
                    // Cache the result
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        holders: lastHolderCount,
                        timestamp: Date.now()
                    }));

                    updateElement('holdersCount', lastHolderCount.toLocaleString('en-US'));
                    console.log(`Holders count fetched from Basescan: ${lastHolderCount}`);
                    return;
                }
            }
        }

        throw new Error('Could not parse holders data from Basescan');
    } catch (error) {
        console.error('Error fetching holders from Basescan:', error);
        // Fallback to static file
        await fetchHoldersFromFile();
    }
}

// Fallback: fetch holders count from static file
async function fetchHoldersFromFile() {
    try {
        const response = await fetch('./token_holders.txt?' + Date.now()); // Cache bust
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const text = await response.text();
        const holders = parseInt(text.trim(), 10);

        if (Number.isFinite(holders) && holders > 0) {
            updateElement('holdersCount', holders.toLocaleString('en-US'));
            console.log(`Holders count from fallback file: ${holders}`);
            return;
        }
        throw new Error('Invalid holders count in file');
    } catch (error) {
        console.error('Error fetching holders from file:', error);
        updateElement('holdersCount', '-');
    }
}

// Update last updated timestamp
function updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    updateElement('lastUpdated', formatted);
}

// Main refresh function
async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');

    try {
        // Initialize provider (async with fallback)
        await initProvider();

        // Fetch data sequentially to avoid RPC batch limits
        const tokenData = await fetchTokenData();
        const pool1Data = await fetchStakingDataPool1(STAKING_POOL_1);
        const pool2Data = await fetchStakingDataPool2(STAKING_POOL_2);

        // Fetch holders count
        await fetchHoldersCount();

        // Update combined stats
        updateCombinedStats(pool1Data, pool2Data, tokenData);

        // Update timestamp
        updateTimestamp();

    } catch (error) {
        console.error('Error refreshing data:', error);
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    refreshData();
    
    // Auto-refresh every 60 seconds
    setInterval(refreshData, 60000);
});
