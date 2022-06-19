const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery", () => {
          let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee
          let deployer, interval

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture("all")
              lottery = await ethers.getContract("Lottery", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              lotteryEntranceFee = await lottery.getEntranceFee()
              interval = await lottery.getInterval()
          })

          describe("constructor", () => {
              it("Initial the lottery correctly", async () => {
                  const lotteryState = await lottery.getLotteryState()
                  const REQUEST_CONFIRMATION = await lottery.getRequestConfirmations()
                  const NUM_WORDS = await lottery.getNumWords()

                  assert.equal(lotteryState.toString(), "0")
                  assert.equal(interval.toString(), "30")
                  assert.equal(REQUEST_CONFIRMATION.toString(), "3")
                  assert.equal(NUM_WORDS.toString(), "1")
              })
          })

          describe("enter lottery", () => {
              it("not paying enough for lottery", async () => {
                  await expect(
                      lottery.enterLottery({ value: ethers.utils.parseEther("0.001") })
                  ).to.be.revertedWith("Lottery__notEnoughEthSent")
              })
              it("records player when entered", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  const player = await lottery.getPlayer(0)
                  const players = await lottery.getNumberOfPlayers()
                  assert.equal(player, deployer)
                  assert.equal(players, "1")
              })
              //testing our own event in contract
              it("emits event on player enter", async () => {
                  await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.emit(
                      lottery, //contract name
                      "lotteryEnter" //event name
                  )
              })

              it("doesn't allow to enter lottery if state is calculating", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  //increasing the time to change the state to calculating
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  //mine a new block
                  await network.provider.send("evm_mine", [])
                  //we pretend to be chain keeper
                  await lottery.performUpkeep([])
                  //check if the error is throw as we are at closing state
                  await expect(
                      lottery.enterLottery({ value: lotteryEntranceFee })
                  ).to.be.revertedWith("Lottery__NotOpen")
              })
          })
          describe("checkUpKeep", () => {
              it("returns false if people didn't sent ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns true when all condition are true", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, true)
              })
              it("returns false if lotteryState is not open", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x") //for blank data u can use 0x or []
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time is not passed", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  //only 10s is gone
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 20])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, false)
              })
          })
          describe("performUpKeep", () => {
              it("can only run if checkupkeep is true", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await lottery.performUpkeep("0x")
                  assert(tx)
              })
              it("update lottery state and emits requestId", async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await lottery.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  /**the first event will be emited by randomWordRequest,
                  we are taking the 2nd emitted event in the method and
                  which is the custom made one so , it is events[1]
                  and its args[0] is requestId*/
                  const requestId = txReceipt.events[1].args.requestId
                  const lotteryState = await lottery.getLotteryState()
                  assert(requestId.toNumber() > 0)
                  assert(lotteryState.toString() == "1")
              })
              it("throws error as checkUpKeep is false", async () => {
                  await expect(lottery.performUpkeep([])).to.be.revertedWith(
                      "Lottery__UpKeepNotNeeded"
                  )
              })
          })
          describe("fullfillRandomWords", () => {
              beforeEach(async () => {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpKeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, resets the lottery , and sends money", async () => {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 //deployer =0
                  const accounts = await ethers.getSigners()
                  for (let i = startingAccountIndex; i <= additionalEntrants; i++) {
                      const accountConnectedLottery = lottery.connect(accounts[i])
                      await accountConnectedLottery.enterLottery({ value: lotteryEntranceFee })
                  }

                  const startingTimeStamp = await lottery.getLatestTimeStamp()

                  //performUpKeep (mock begine chainlink keepers)
                  //fulfillRandomWords (mock being the Chainlink VRF)
                  //we will have to wait for the fullfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      lottery.once("winnerPicked", async () => {
                          console.log("-----------event found!-------------")
                          try {
                              const recentWinner = await lottery.getRecentWinner()
                              //to find the account that wins
                              //   console.log(recentWinner)
                              //   console.log(accounts[0].address)
                              //   console.log(accounts[1].address)
                              //   console.log(accounts[2].address)
                              //   console.log(accounts[3].address)
                              const lotteryState = await lottery.getLotteryState()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()
                              const numPlayers = await lottery.getNumberOfPlayers()
                              const winnerEndingBalance = await accounts[1].getBalance()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(lotteryState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              //to check if the winner got all the contract amount
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartBalance.add(
                                      lotteryEntranceFee
                                          .mul(additionalEntrants) //mul entrance fee with no of new accounts
                                          .add(lotteryEntranceFee) // the lottery fee paid by deployer
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      //setting up the listener
                      //below , we eill fire te event and the listener will pick it up and resolve
                      const tx = await lottery.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      //using log to find winner
                      const winnerStartBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottery.address
                      )
                  })
              })
          })
      })
