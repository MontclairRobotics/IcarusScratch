const Runtime = require('../../engine/runtime');
const Sprite = require('../../sprites/sprite')
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const log = require('../../util/log');
const Cast = require('../../util/cast');
const Target = require('../../engine/target');
const RenderedTarget = require('../../sprites/rendered-target');
const MathUtil = require('../../util/math-util');

function trapezoidEvolve(current, target, max_delta, dt)
{
    if(current instanceof Vec2d)
    {
        return new Vec2d(
            MathUtil.clamp(target.x, current.x - max_delta*dt, current.x + max_delta*dt),
            MathUtil.clamp(target.y, current.y - max_delta*dt, current.y + max_delta*dt)
        )
    }

    return MathUtil.clamp(target, current - max_delta*dt, current + max_delta*dt)
}

class Vec2d
{
    /**
     * @param {number} x 
     * @param {number} y 
     */
    constructor(x, y)
    {
        /**
         * @type number
         */
        this.x = x
        /**
         * @type number
         */
        this.y = y
    }

    static get zero()
    {
        return new Vec2d(0, 0)
    }

    add(other)
    {
        return new Vec2d(this.x + other.x, this.y + other.y)
    }
    sub(other)
    {
        return new Vec2d(this.x - other.x, this.y - other.y)
    }
    mul(other)
    {
        return new Vec2d(this.x * other, this.y * other)
    }
    div(other)
    {
        return new Vec2d(this.x / other, this.y / other)
    }

    get neg()
    {
        return new Vec2d(-this.x, -this.y)
    }

    get length()
    {
        return Math.hypot([this.x, this.y])
    }

    rot(deg)
    {
        rad = MathUtil.degToRad(deg)
        return new Vec2d(
            this.x * Math.cos(rad) - this.y * Math.sin(rad),
            this.x * Math.sin(rad) + this.y * Math.cos(rad)
        )
    }

    static from(obj)
    {
        return new Vec2d(obj.x, obj.y)
    }
}

const XYAccel = 5;
const ThetaAccel = 60;

const StingerOut = 0;
const StingerIn = 0;

class IcarusExtension
{
    constructor(runtime)
    {
        /**
         * The runtime object
         * @type {Runtime}
         */
        this.runtime = runtime

        this.vel = Vec2d.zero
        this.omega = 0

        this.target_vel = Vec2d.zero
        this.target_omega = 0

        this.field_relative = true

        this.stinger_out = false
        this.grabber_grab = false

        console.log(this.runtime.eventNames())
    }

    /**
     * @returns {Sprite | Target | RenderedTarget}
     */
    getRobot()
    {
        return this.runtime.getSpriteTargetByName('Icarus')
    }

    /**
     * @returns {(Target | RenderedTarget)[]}
     */
    getGamePieces()
    {
        let ret = []
        this.runtime.getSpriteTargetByName('Cube').clones.forEach(ret.push)
        return ret
    }

    getInfo() 
    {
        return {
            id: "icarus",
            name: "Icarus",

            color1: "#2090FF",
            color2: "#2090FF",

            blocks: [
                {
                    opcode: "ternary",
                    blockType: BlockType.REPORTER,
                    text: "if [CONDITION] then [TRUE] else [FALSE]",
                    arguments: {
                        CONDITION: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        },
                        TRUE: {
                            type: ArgumentType.STRING,
                            defaultValue: " "
                        },
                        FALSE: {
                            type: ArgumentType.STRING,
                            defaultValue: " "
                        }
                    }
                },
                {
                    opcode: 'tripleif',
                    blockType: BlockType.CONDITIONAL,
                    text: [
                        "if [COND1] then",
                        "elif [COND2] then",
                        "else"
                    ],
                    branchCount: 3,
                    arguments: {
                        COND1: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        },
                        COND2: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        }
                    }
                },
                '---',
                {
                    opcode: "update",
                    blockType: BlockType.COMMAND,
                    text: "update icarus"
                },
                '---',
                {
                    opcode: "setSpeeds",
                    blockType: BlockType.COMMAND,
                    text: "drive at x[X] y[Y] angle[T]",
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        T: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "setXSpeed",
                    blockType: BlockType.COMMAND,
                    text: "drive at x[X]",
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "setYSpeed",
                    blockType: BlockType.COMMAND,
                    text: "drive at y[Y]",
                    arguments: {
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "setTSpeed",
                    blockType: BlockType.COMMAND,
                    text: "drive at angle[T]",
                    arguments: {
                        T: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "xSpeed",
                    blockType: BlockType.REPORTER,
                    text: 'current target x speed'
                },
                {
                    opcode: "ySpeed",
                    blockType: BlockType.REPORTER,
                    text: 'current target y speed'
                },
                {
                    opcode: "tSpeed",
                    blockType: BlockType.REPORTER,
                    text: 'current target angular speed'
                },
                '---',
                {
                    opcode: 'getFieldRelative',
                    blockType: BlockType.BOOLEAN,
                    text: 'field relative?'
                },
                {
                    opcode: 'enableFieldRelative',
                    blockType: BlockType.COMMAND,
                    text: 'enable field relative'
                },
                {
                    opcode: 'disableFieldRelative',
                    blockType: BlockType.COMMAND,
                    text: 'disable field relative'
                }
            ]
        }
    }

    tripleif({COND1, COND2})
    {
        let branch = 3
        if(Cast.toBoolean(COND1)) branch = 1
        else if(Cast.toBoolean(COND2)) branch = 2
        
        this.runtime.sequencer.stepToBranch(this.runtime.sequencer.activeThread, branch, false)
    }

    ternary({CONDITION, TRUE, FALSE})
    {
        if(Cast.toBoolean(CONDITION)) return TRUE
        return FALSE
    }

    update()
    {
        let robot = this.getRobot()

        if(!robot) return
        
        this.vel   = trapezoidEvolve(this.vel,   this.target_vel,   XYAccel,    this.runtime.currentStepTime / 1000)
        this.omega = trapezoidEvolve(this.omega, this.target_omega, ThetaAccel, this.runtime.currentStepTime / 1000)

        let realVel = this.vel

        if(!this.field_relative)
        {
            realVel = realVel.rot(robot.direction)
        }

        robot.x         += this.vel.x
        robot.y         += this.vel.y
        robot.direction += this.omega

        robot.setXY(robot.x, robot.y)
        robot.setDirection(robot.direction)
    }

    setSpeeds({X, Y, T}) 
    {
        this.setXSpeed({X})
        this.setYSpeed({Y})
        this.setTSpeed({T})
    }

    getFieldRelative() {return this.field_relative}
    enableFieldRelative() {this.field_relative = true}
    disableFieldRelative() {this.field_relative = false}

    setXSpeed({X})
    {
        this.target_vel.x = Cast.toNumber(X)
    }
    setYSpeed({Y})
    {
        this.target_vel.y = Cast.toNumber(Y)
    }
    setTSpeed({T})
    {
        this.target_omega = Cast.toNumber(T)
    }

    xSpeed() {return this.target_vel.x}
    ySpeed() {return this.target_vel.y}
    tSpeed() {return this.target_omega}
}

module.exports = IcarusExtension