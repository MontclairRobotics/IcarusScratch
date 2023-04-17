const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const log = require('../../util/log');

const buttons = [
    'A', 'B', 'X', 'Y',
    'Left-Bumper', 'Right-Bumper', 'Left-Trigger', 'Right-Trigger',
    'Window-Button', 'Menu-Button', 'Left-Joystick', 'Right-Joystick', 'DPAD-Up', 'DPAD-Down', 'DPAD-Left', 'DPAD-Right'
];

const axes = ["Left Joystick Horizontal", "Left Joystick Vertical", "Right Joystick Horizontal", "Right Joystick Vertical"]

const joysticks = ["Left-Trigger", "Right-Trigger"]

class Scratch3Controllers {
    constructor(runtime) {
        this.runtime = runtime;

        window.addEventListener("gamepadconnected", (e) => {
            console.log(
                "Gamepad connected at index %d: %s. %d buttons, %d axes.",
                e.gamepad.index,
                e.gamepad.id,
                e.gamepad.buttons.length,
                e.gamepad.axes.length
            );
        });
        window.addEventListener("gamepaddisconnected", (e) => {
            console.log(
                "Gamepad disconnected at index %d: %s. %d buttons, %d axes.",
                e.gamepad.index,
                e.gamepad.id,
                e.gamepad.buttons.length,
                e.gamepad.axes.length
            );
        });
    }

    getInfo() {
        return {
            id: 'controllers',
            name: "Controllers",
            blocks: [
                {
                    opcode: 'whenButtonPressed',
                    blockType: BlockType.HAT,
                    text: 'When button [BUTTON] pressed on controller [NUMBER]',
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.STRING,
                            defaultValue: "A",
                            menu: 'gamepadButtons'
                        },
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "1",
                            menu: 'gamePads'
                        }
                    }
                },
                {
                    opcode: 'getButtonPressed',
                    blockType: BlockType.BOOLEAN,
                    text: 'button [BUTTON] pressed on controller [NUMBER]?',
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.STRING,
                            defaultValue: "A",
                            menu: 'gamepadButtons'
                        },
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "1",
                            menu: 'gamePads'
                        }
                    }
                },
                {
                    opcode: 'getAxis',
                    blockType: BlockType.REPORTER,
                    text: 'Value of [AXIS] on controller [NUMBER]',
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            defaultValue: "Left Joystick Horizontal",
                            menu: 'axes'
                        },
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "1",
                            menu: 'gamePads'
                        },
                    }
                },
                {
                    opcode: 'getTrigger',
                    blockType: BlockType.REPORTER,
                    text: 'Value of [TRIGGER] on controller [NUMBER]',
                    arguments: {
                        TRIGGER: {
                            type: ArgumentType.STRING,
                            defaultValue: "Left-Trigger",
                            menu: 'joysticks'
                        },
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: "1",
                            menu: 'gamePads'
                        },
                    }
                },
            ],
            menus: {
                gamepadButtons: {
                    items: buttons
                },
                gamePads: {
                    items: ["1", "2", "3", "4"]
                },
                joysticks: {
                    items: ["Left", "Right"]
                },
                axes: {
                    items: axes
                },
                joysticks: {
                    items: joysticks
                }
            }
        };
    }

    getButtonPressed(args) {
        const button = Cast.toString(args.BUTTON);
        const gamePadNum = Cast.toNumber(args.NUMBER) - 1;
        if (navigator.getGamepads()[gamePadNum] == undefined) return false
        let gamePad = navigator.getGamepads()[gamePadNum];
        let buttonIndex = buttons.indexOf(button);

        return gamePad.buttons[buttonIndex].pressed;
    }
    //Yes I know this is stupid, if I don't do this scratch thinks it's the same block as the HAT block.
    whenButtonPressed(args) {
        return this.getButtonPressed(args);
    }


    getAxis(args) {
        const axis = Cast.toString(args.AXIS);
        const gamePadNum = Cast.toNumber(args.NUMBER) - 1;
        if (navigator.getGamepads()[gamePadNum] == undefined) return 0
        const axisIndex = axes.indexOf(axis);
        if (axis === "Left Joystick Vertical" || axis === "Right Joystick Vertical") {
            return -1 * navigator.getGamepads()[gamePadNum].axes[axisIndex];
        }
        return navigator.getGamepads()[gamePadNum].axes[axisIndex];
    }

    getTrigger(args) {
        const trigger = Cast.toString(args.TRIGGER);
        const gamePadNum = Cast.toNumber(args.NUMBER) - 1;
        const buttonIndex = buttons.indexOf(trigger);
        if (navigator.getGamepads()[gamePadNum] == undefined) return 0
        return navigator.getGamepads()[gamePadNum].buttons[buttonIndex].value;
    }

}

module.exports = Scratch3Controllers;