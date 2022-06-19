//Pay Money to lottery
//Pick a random winner
//Winner to be selected for every X minutes
//Chainlink oracle-> Random number generation, Automated Execution(Chainlink keeper)

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

//imported the contract that are need for randomNumber
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol"; //for automatic execution

error Lottery__notEnoughEthSent();
error Lottery__transferFailed();
error Lottery__NotOpen();
error Lottery__UpKeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**
    @title Lottery Contract
    @author Sanjay S
    @notice This contract is for playing Lottery
    @dev This contract uses  VRFConsumerBaseV2 for random number generation and
        KeeperCompatibleInterface for automatic winner selection
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /**Type declaration */
    enum LotteryState {
        OPEN,
        CALCULATING
    } // uint256 0 = OPEN, 1 = CALCULATING

    /**State Variables */
    address payable[] private s_players;
    uint256 private immutable i_entranceFee;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callBackGasLimit;
    uint256 private immutable i_interval; //the time for getting new winners
    uint16 private constant REQUEST_CONFIRMATION = 3;
    uint32 private constant NUM_WORDS = 1;
    uint256 private s_lastTimeStamp; //time of block created

    /**Lottery variables */
    address private s_recentWinner;
    LotteryState private s_lotteryState;

    /**Events */
    event lotteryEnter(address indexed player);
    event RequestLotteryWinner(uint256 indexed requestId);
    event winnerPicked(address indexed winner);

    /**Functions */
    //  VRFConsumerBaseV2 required vrfCoordinatorV2 and its was passed through contructor
    constructor(
        address _vrfCoordinatorV2, //contract
        uint256 _entranceFee,
        bytes32 _gasLane,
        uint64 _subscriptionId,
        uint32 _callBackGasLimit,
        uint256 _interval
    ) VRFConsumerBaseV2(_vrfCoordinatorV2) {
        i_entranceFee = _entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinatorV2);
        i_gasLane = _gasLane;
        i_subscriptionId = _subscriptionId;
        i_callBackGasLimit = _callBackGasLimit;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = _interval;
    }

    function enterLottery() public payable {
        //checking the entranceFee
        if (msg.value < i_entranceFee) revert Lottery__notEnoughEthSent();
        //checking the state, its need to be open
        if (s_lotteryState != LotteryState.OPEN) revert Lottery__NotOpen();
        s_players.push(payable(msg.sender)); //adding new players
        emit lotteryEnter(msg.sender); //notify once the player is added
    }

    /**
        @dev this is the function that the chainlink keeper nodes call
        they look for the upKeepNeeded to return true
        the following need to be true:
        1. our time interval should have passed
        2. The lottery should have at least 1 player, and have some ETH
        3. Our subscription is funded with link
        4. lottery should be in open state(no new player is currently added)
     */

    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (LotteryState.OPEN == s_lotteryState); //check if state is open
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval); //time for new winner is reached
        bool hasPlayers = (s_players.length > 0); //has player to select
        bool hasBalance = address(this).balance > 0; //has balance in contract
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
        return (upkeepNeeded, "0x0");
    }

    /**
        @dev this execute the action need to be done if 
        the upKeepNeeded returns true
        1. checking if upKeepNeeded is true
        2. changing the state
        3. generating random number 
        4. emiting lottery winner event 
     */
    function performUpkeep(
        bytes calldata /**performData*/
    ) external override {
        (bool upKeepNeeded, ) = checkUpkeep("");
        if (!upKeepNeeded)
            revert Lottery__UpKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_lotteryState)
            );
        //changing state, it makes no one enter lottery
        s_lotteryState = LotteryState.CALCULATING;

        //request the random number
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //max gas to be used
            i_subscriptionId, //Id for using the contract
            REQUEST_CONFIRMATION, //No of confirmed block required
            i_callBackGasLimit, //gas limit for fulfillRandomWords to execute
            NUM_WORDS //no of random numbers
        );
        //emit new lottery winner
        emit RequestLotteryWinner(requestId);
    }

    //we need to override this function exist in VRFConsumerBase contract
    //it generates random number and resets the contract state
    function fulfillRandomWords(
        uint256, /**_requestID*/ //not used, so commented
        uint256[] memory _randomWords
    ) internal override {
        uint256 winnerIndex = _randomWords[0] % s_players.length; // rnd_number % length gives random index value b/w 0 to player size
        address payable winner = s_players[winnerIndex]; //getting the winner
        s_lotteryState = LotteryState.OPEN; //state is open as new winner is found
        s_players = new address payable[](0); //starting new
        s_lastTimeStamp = block.timestamp;
        s_recentWinner = winner; // storing the recent winner
        (bool success, ) = winner.call{value: address(this).balance}(""); //paying the winner with all the amount within contract
        if (!success) revert Lottery__transferFailed(); // checking transaction status
        emit winnerPicked(winner); //notifying winner picked
    }

    /**View/Pure functions */

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 _index) public view returns (address) {
        return s_players[_index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    //its pure as the value is read direct and not from storage
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATION;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
