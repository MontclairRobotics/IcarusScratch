const Runtime = require('../../engine/runtime');
const Sprite = require('../../sprites/sprite')
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Target = require('../../engine/target');
const RenderedTarget = require('../../sprites/rendered-target');
const BlockUtility = require('../../engine/block-utility');
const Timer = require('../../util/timer');

const {Vec2d, trapezoidEvolve, Box2d, AABB} = require('../helpers');
const MathUtil = require('../../util/math-util');

const MAX_VEL = 30;
const MAX_OMG = 600;

const XYAccel = 15;
const ThetaAccel = 180;

const StingerOut = 1;
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

        this.held_piece = null
        this.held_piece_offset = Vec2d.zero
        this.held_piece_dir_off = 0

        console.log('Initializing ICARUS')
    }

    /**
     * @returns {Sprite | Target | RenderedTarget}
     */
    getRobot()
    {
        return this.runtime.getSpriteTargetByName('Robot')
    }

    /**
     * @returns {Sprite | Target | RenderedTarget}
     */
    getBonk()
    {
        return this.runtime.getSpriteTargetByName('Bonk')
    }

    /**
     * @returns {(Target | RenderedTarget)[]}
     */
    getGamePieces()
    {
        let ret = []
        this.runtime.getSpriteTargetByName('Cube').clones.forEach(ret.push.bind(ret))
        return ret
    }

    getInfo() 
    {
        return {
            id: "icarus",
            name: "Icarus",

            color1: "#1060A0",
            color2: "#053070",

            blocks: [
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
                {
                    opcode: "xPos",
                    blockType: BlockType.REPORTER,
                    text: 'robot x position'
                },
                {
                    opcode: "yPos",
                    blockType: BlockType.REPORTER,
                    text: 'robot y position'
                },
                {
                    opcode: "dir",
                    blockType: BlockType.REPORTER,
                    text: 'robot direction'
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
                },
                '---',
                {
                    opcode: 'getGrabberGrabbed',
                    blockType: BlockType.BOOLEAN,
                    text: 'grabber closed?'
                },
                {
                    opcode: 'grabGrabber',
                    blockType: BlockType.COMMAND,
                    text: 'close grabber'
                },
                {
                    opcode: 'releaseGrabber',
                    blockType: BlockType.COMMAND,
                    text: 'open grabber'
                },
                {
                    opcode: 'getStingerOut',
                    blockType: BlockType.BOOLEAN,
                    text: 'stinger is out?'
                },
                {
                    opcode: 'stingerOut',
                    blockType: BlockType.COMMAND,
                    text: 'stinger out'
                },
                {
                    opcode: 'stingerIn',
                    blockType: BlockType.COMMAND,
                    text: 'stinger in'
                },
            ]
        }
    }

    
    getBox()
    {
        const robot = this.getRobot()

        if(!robot) return null

        const SIZE = 152 * robot.size / 100

        return new Box2d(
            robot.getVec(), 
            new Vec2d(SIZE, SIZE), 
            90 - robot.direction
        )
    }

    /**
     * @type {AABB[]}
     */
    static BOUNDARIES = [
        // border around
        AABB.minAndSize(new Vec2d(-240, -180), new Vec2d(85, 360)),
        AABB.minAndSize(new Vec2d(-240, -220), new Vec2d(520, 40)),
        AABB.minAndSize(new Vec2d(-240, +180), new Vec2d(520, 40)),
        AABB.minAndSize(new Vec2d(+240, -220), new Vec2d(40, 400)),

        // charge station
        new AABB(new Vec2d(-10, +80), new Vec2d(80, 1)),
        new AABB(new Vec2d(-10, -80), new Vec2d(80, 1)),
    ]


    update()
    {
        const robot = this.getRobot()

        if(!robot) return

        this.target_vel.x = MathUtil.clamp(this.target_vel.x, -MAX_VEL, MAX_VEL)
        this.target_vel.y = MathUtil.clamp(this.target_vel.y, -MAX_VEL, MAX_VEL)
        this.target_omega = MathUtil.clamp(this.target_omega, -MAX_OMG, MAX_OMG)
        
        this.vel   = trapezoidEvolve(this.vel,   this.target_vel,   XYAccel,    this.runtime.currentStepTime / 1000)
        this.omega = trapezoidEvolve(this.omega, this.target_omega, ThetaAccel, this.runtime.currentStepTime / 1000)

        let realVel = this.vel

        if(!this.field_relative)
        {
            realVel = realVel.rot(90 - robot.direction)
        }

        if(this.stinger_out)
        {
            robot.setCostume(StingerOut)
        }
        else
        {
            robot.setCostume(StingerIn)
        }

        const steps = Math.min(10, Math.ceil(this.vel.length / 3))
        const velStep = this.vel.div(steps)
        const omgStep = this.omega / steps

        const bonk = this.getBonk()
        if(bonk)
        {
            bonk.setEffect('ghost', 100)
            bonk.setDirection(Math.random() * 360)
        }

        let hit = {
            x: false,
            y: false,
            o: false
        }

        // handle translation
        for(let i = 0; i < steps; i++)
        {
            let hitBoundary = false

            trymove = (move, unmove, modVel) =>
            {
                move()
                const box = this.getBox()

                for (const boundary of IcarusExtension.BOUNDARIES)
                {
                    const intersect = boundary.intersect(box)
                    if(intersect)
                    {
                        unmove()
                        modVel()

                        if(bonk)
                        {
                            bonk.setEffect('ghost', 0)
                            bonk.setXY(intersect.x, intersect.y)
                        }

                        hitBoundary = true
                        return
                    }
                }
            }
            
            trymove(
                () => robot.x += velStep.x,
                () => robot.x -= velStep.x,
                () => {if(!hit.x) {hit.x = true; this.vel.x = velStep.x * i}}
            )
            trymove(
                () => robot.y += velStep.y,
                () => robot.y -= velStep.y,
                () => {if(!hit.y) {hit.y = true; this.vel.y = velStep.y * i}}
            )
            trymove(
                () => robot.direction += omgStep,
                () => robot.direction -= omgStep,
                () => {if(!hit.o) {hit.o = true; this.omega = omgStep * i}}
            )

            if(hitBoundary) break
        }

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
    
    getGrabberGrabbed() {return this.grabber_grab}
    grabGrabber() {this.grabber_grab = true}
    releaseGrabber() {this.grabber_grab = false}
    
    getStingerOut() {return this.stinger_out}
    stingerOut() {this.stinger_out = true}
    stingerIn() {this.stinger_out = false}

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

    /**
     * @param {(robot: (Sprite | RenderedTarget | Target)) => number} fn 
     * @returns {number}
     */
    inspectBot(fn)
    {
        const robot = this.getRobot();
        if (robot) return fn(robot);
        else return 0;
    }

    xPos() {return this.inspectBot(r => r.x)}
    yPos() {return this.inspectBot(r => r.y)}
    dir() {return this.inspectBot(r => r.direction)}
}

module.exports = IcarusExtension