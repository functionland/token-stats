// Contract Addresses
const FULA_TOKEN_ADDRESS = '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB';
const STAKING_POOL_1 = '0xb2064743e3da40bB4C18e80620A02a38e87fB145';
const STAKING_POOL_2 = '0x4E875E0A4fEa97E83f1350b63420c36e38241db4';

// Base Network RPC
const BASE_RPC_URL = 'https://mainnet.base.org';

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

const STAKING_ABI = [
    'function totalStaked() view returns (uint256)',
    'function totalStaked180Days() view returns (uint256)',
    'function totalStaked365Days() view returns (uint256)',
    'function totalStaked730Days() view returns (uint256)',
    'function stakePool() view returns (address)',
    'function rewardPool() view returns (address)'
];

// Known non-circulating addresses (team, treasury, etc.) - can be expanded
const NON_CIRCULATING_ADDRESSES = [
    '0x0000000000000000000000000000000000000000', // Zero address (burned)
    '0x000000000000000000000000000000000000dEaD', // Dead address (burned)
];

let provider;

// Initialize provider
function initProvider() {
    provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
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
    if (!weiAmount) return null;
    const amount = Number(weiAmount) / Math.pow(10, decimals);
    return amount;
}

// Update DOM element with value or error
function updateElement(id, value, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    
    if (isError) {
        element.innerHTML = `<span class="error-value">${value}</span>`;
    } else {
        element.textContent = value;
    }
}

// Fetch token data
async function fetchTokenData() {
    try {
        const tokenContract = new ethers.Contract(FULA_TOKEN_ADDRESS, ERC20_ABI, provider);
        
        const [totalSupply, decimals] = await Promise.all([
            tokenContract.totalSupply(),
            tokenContract.decimals()
        ]);

        const totalSupplyFormatted = formatTokenAmount(totalSupply, Number(decimals));
        const burnedAmount = formatTokenAmount(INITIAL_SUPPLY - totalSupply, Number(decimals));
        
        updateElement('totalSupply', formatNumber(totalSupplyFormatted) + ' FULA');
        updateElement('burnedTokens', formatNumber(burnedAmount) + ' FULA');

        // Calculate circulating supply
        // Circulating = Total Supply - Staked tokens - Non-circulating balances
        let nonCirculating = BigInt(0);
        
        for (const address of NON_CIRCULATING_ADDRESSES) {
            try {
                const balance = await tokenContract.balanceOf(address);
                nonCirculating += balance;
            } catch (e) {
                console.warn(`Could not fetch balance for ${address}:`, e);
            }
        }

        return {
            totalSupply,
            decimals: Number(decimals),
            nonCirculating
        };
    } catch (error) {
        console.error('Error fetching token data:', error);
        updateElement('totalSupply', 'Error loading', true);
        updateElement('burnedTokens', 'Error loading', true);
        throw error;
    }
}

// Fetch staking data for a pool
async function fetchStakingData(poolAddress, poolName) {
    try {
        const stakingContract = new ethers.Contract(poolAddress, STAKING_ABI, provider);
        
        const [
            totalStaked,
            staked180Days,
            staked365Days,
            staked730Days
        ] = await Promise.all([
            stakingContract.totalStaked(),
            stakingContract.totalStaked180Days(),
            stakingContract.totalStaked365Days(),
            stakingContract.totalStaked730Days()
        ]);

        const prefix = poolName === 'pool1' ? 'pool1' : 'pool2';
        
        updateElement(`${prefix}-180days`, formatNumber(formatTokenAmount(staked180Days)) + ' FULA');
        updateElement(`${prefix}-365days`, formatNumber(formatTokenAmount(staked365Days)) + ' FULA');
        updateElement(`${prefix}-730days`, formatNumber(formatTokenAmount(staked730Days)) + ' FULA');
        updateElement(`${prefix}-total`, formatNumber(formatTokenAmount(totalStaked)) + ' FULA');

        return {
            totalStaked,
            staked180Days,
            staked365Days,
            staked730Days
        };
    } catch (error) {
        console.error(`Error fetching staking data for ${poolName}:`, error);
        const prefix = poolName === 'pool1' ? 'pool1' : 'pool2';
        updateElement(`${prefix}-180days`, 'Error', true);
        updateElement(`${prefix}-365days`, 'Error', true);
        updateElement(`${prefix}-730days`, 'Error', true);
        updateElement(`${prefix}-total`, 'Error', true);
        
        return {
            totalStaked: BigInt(0),
            staked180Days: BigInt(0),
            staked365Days: BigInt(0),
            staked730Days: BigInt(0)
        };
    }
}

// Update combined statistics
function updateCombinedStats(pool1Data, pool2Data, tokenData) {
    const total180 = pool1Data.staked180Days + pool2Data.staked180Days;
    const total365 = pool1Data.staked365Days + pool2Data.staked365Days;
    const total730 = pool1Data.staked730Days + pool2Data.staked730Days;
    const totalAllPools = pool1Data.totalStaked + pool2Data.totalStaked;

    updateElement('all-180days', formatNumber(formatTokenAmount(total180)) + ' FULA');
    updateElement('all-365days', formatNumber(formatTokenAmount(total365)) + ' FULA');
    updateElement('all-730days', formatNumber(formatTokenAmount(total730)) + ' FULA');
    updateElement('allPools-total', formatNumber(formatTokenAmount(totalAllPools)) + ' FULA');

    // Calculate circulating supply
    // Circulating = Total Supply - Total Staked
    if (tokenData && tokenData.totalSupply) {
        const circulatingSupply = tokenData.totalSupply - totalAllPools - tokenData.nonCirculating;
        updateElement('circulatingSupply', formatNumber(formatTokenAmount(circulatingSupply, tokenData.decimals)) + ' FULA');
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
        initProvider();

        // Fetch all data in parallel
        const [tokenData, pool1Data, pool2Data] = await Promise.all([
            fetchTokenData(),
            fetchStakingData(STAKING_POOL_1, 'pool1'),
            fetchStakingData(STAKING_POOL_2, 'pool2')
        ]);

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
