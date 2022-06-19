require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("hardhat-contract-sizer")
require("dotenv").config()

const RINKEBY_URL = process.env.RINKEBY_URL || "https://eth-rinkeby.alchemyapi.io/v2/your-api-key"
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x"
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "api key"
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "api key"

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 31337,
            blockConfirmations: 1,
        },
        localhost: {
            chainId: 31337,
        },
        rinkeby: {
            chainId: 4,
            blockConfirmations: 6,
            url: RINKEBY_URL,
            accounts: [PRIVATE_KEY],
        },
    },
    solidity: "0.8.8",
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        },
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
    gasReporter: {
        enabled: true,
        outputFile: "gas-report.txt", //file name
        noColors: true, //colored output or not
        currency: "INR", //currency type
        //coinmarketcap: COINMARKETCAP_API_KEY, //key to access coinmarketcap
        //token: "MATIC", //polygon network and default ethereum
    },
    mocha: {
        timeout: 300000, //200 sec max
    },
}
