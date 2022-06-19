const { ethers, network } = require("hardhat")
const { writeFileSync, readFileSync } = require("fs-extra")

const FRONTEND_CONTRACT_ADDRESS_FILE_PATH = "../nextjs-lottery-app/Constants/contractAddress.json"
const FRONTEND_ABI_FILE_PATH = "../nextjs-lottery-app/Constants/abi.json"

module.exports = async () => {
    if (process.env.UPDATE_FRONTEND) {
        console.log("updating frontend!!")
        updateContractAddress()
        updateABI()
    }
}

async function updateContractAddress() {
    const lottery = await ethers.getContract("Lottery")
    const chainId = network.config.chainId.toString()
    const contractAddress = JSON.parse(readFileSync(FRONTEND_CONTRACT_ADDRESS_FILE_PATH, "utf-8"))
    if (chainId in contractAddress) {
        if (!contractAddress[chainId].includes(lottery.address)) {
            contractAddress[chainId].push(raffle.address)
        }
    } else {
        contractAddress[chainId] = [lottery.address]
    }
    writeFileSync(FRONTEND_CONTRACT_ADDRESS_FILE_PATH, JSON.stringify(contractAddress))
}

async function updateABI() {
    const lottery = await ethers.getContract("Lottery")
    writeFileSync(FRONTEND_ABI_FILE_PATH, lottery.interface.format(ethers.utils.FormatTypes.json))
}

module.exports.tags = ["all", "frontend"]
