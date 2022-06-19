const { assert, expect } = require("chai")
const { network, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery", () => {
          let lottery, lotteryEntranceFee, deployer

          beforeEach(async () => {
              console.log("Before each!---------------------")
              deployer = (await getNamedAccounts()).deployer
              lottery = await ethers.getContract("Lottery", deployer)
              lotteryEntranceFee = ethers.utils.parseEther("0.01")
              console.log("Before each over!---------------------")
          })

          describe("fullfillRandomWords", () => {
              it("works with live chainlink keepers and chainlink VRF, we get a random winner", async () => {
                  console.log("setting up!!--------------")
                  const startingTimeStamp = await lottery.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()
                  console.log("setting up over!!--------------")
                  await new Promise(async (resolve, reject) => {
                      lottery.once("winnerPicked", async () => {
                          console.log("-----------Winner Picked-----------")
                          try {
                              const recentWinner = await lottery.getRecentWinner()
                              const lotteryState = await lottery.getLotteryState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()
                              //no player will be existing as winner is chosen
                              await expect(lottery.getPlayer(0)).to.be.reverted
                              assert.equal(lotteryState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winnerEndingBalance.toString(), //final balance
                                  winnerStartingBalance.add(lotteryEntranceFee).toString() // amount given to contract
                              )
                              assert.equal(recentWinner.toString(), accounts[0].address.toString())
                              resolve()
                          } catch (e) {
                              console.log(e)
                              reject(e)
                          }
                      })
                      //enter lottery
                      console.log("entering lottery!---------------")
                      await lottery.enterLottery({ value: lotteryEntranceFee })
                      console.log("Time to wait-------------------")
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
