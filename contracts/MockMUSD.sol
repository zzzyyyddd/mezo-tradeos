// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockMUSD is ERC20 {
    constructor() ERC20("Mock MUSD", "mMUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
