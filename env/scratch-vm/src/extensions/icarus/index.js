const Runtime = require('../../engine/runtime');
const Sprite = require('../../sprites/sprite')
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Target = require('../../engine/target');
const RenderedTarget = require('../../sprites/rendered-target');
const BlockUtility = require('../../engine/block-utility');
const Timer = require('../../util/timer');

const {Vec2d, trapezoidEvolve, Box2d, AABB, LineSegment2d, angleDifference} = require('../helpers');
const MathUtil = require('../../util/math-util');
const Thread = require('../../engine/thread');

const MAX_VEL = 30;
const MAX_OMG = 20;

const XYAccel = 15;
const ThetaAccel = 30;

const StingerOut = 1;
const StingerIn = 0;

const Engaged = 1;
const NotEngaged = 0;

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
        this.vision_active = false

        this.last_grabber_grab = false

        this.held_piece = null
        this.held_piece_dir_off = 0

        this.calculated_cube = null

        this.docked = false
        this.engaged = false

        console.log('Initializing ICARUS')
    }

    setup({X, Y})
    {
        const robot = this.getRobot()
        const cubeBase = this.runtime.getSpriteTargetByName('Cube')

        if (!robot || !cubeBase) return

        robot.setXY(MathUtil.clamp(Cast.toNumber(X), -127, -99), MathUtil.clamp(Cast.toNumber(Y), -150, 150))
        robot.setDirection(0)

        cubeBase.setXY(180, 120)
        cubeBase.setVisible(true)
        cubeBase.goBackwardLayers(1000)

        for(let i = 0; i < 3; i++)
        {
            /**
             * @type {RenderedTarget}
             */
            const clone = cubeBase.makeClone()
            
            if (clone) 
            {
                this.runtime.addTarget(clone)
            }

            clone.setXY(180, 120 - (i + 1) * 80)
            clone.setVisible(true)
            clone.goBackwardLayers(1000)
        }
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
    getVisionCone()
    {
        return this.runtime.getSpriteTargetByName('Vision Cone')
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
        /**
         * @type {RenderedTarget}
         */
        const cubeBase = this.runtime.getSpriteTargetByName('Cube')

        if(!cubeBase) return null

        return [].concat(cubeBase.sprite.clones)
    }

    validState() 
    {
        const robot = this.getRobot()
        const cubes = this.getGamePieces()
        const visionCone = this.getVisionCone()

        return !!robot || !!cubes || !!visionCone
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
                {
                    opcode: "setup",
                    blockType: BlockType.COMMAND,
                    text: "start with robot at [X] [Y]",
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: -150
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "validState",
                    blockType: BlockType.BOOLEAN,
                    text: "project is valid for icarus"
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
                    opcode: "spinToAngle",
                    blockType: BlockType.COMMAND,
                    text: "turn to[X]",
                    arguments: {
                        X: {
                            type: ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: "spinToCube",
                    blockType: BlockType.COMMAND,
                    text: "turn to cube"
                },
                '---',
                {
                    opcode: "getDocked",
                    blockType: BlockType.BOOLEAN,
                    text: "docked with charge station?"
                },
                {
                    opcode: "getEngaged",
                    blockType: BlockType.BOOLEAN,
                    text: "engaged with charge station?"
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
                '---',
                {
                    opcode: 'getVisionActive',
                    blockType: BlockType.BOOLEAN,
                    text: 'vision active?'
                },
                {
                    opcode: 'visionOn',
                    blockType: BlockType.COMMAND,
                    text: 'enable vision'
                },
                {
                    opcode: 'visionOff',
                    blockType: BlockType.COMMAND,
                    text: 'disable vision'
                },
                {
                    opcode: 'visionAngle',
                    blockType: BlockType.REPORTER,
                    text: 'vision angle'
                }
            ]
        }
    }

    getDocked() {return this.docked}
    getEngaged() {return this.engaged}

    
    getBox()
    {
        const robot = this.getRobot()

        if(!robot) return null

        const SIZE = IcarusExtension.ROBOT_SIZE * robot.size / 100

        return new Box2d(
            robot.getVec(), 
            new Vec2d(SIZE, SIZE), 
            90 - robot.direction
        )
    }
    getBoxesWithoutIntake()
    {
        const robot = this.getRobot()

        if(!robot) return null

        const SIZE = IcarusExtension.ROBOT_SIZE * robot.size / 100
        const DEPTH = IcarusExtension.INTAKE_DEPTH * robot.size / 100
        const WIDTH = IcarusExtension.INTAKE_WIDTH * robot.size / 100

        return [
            new Box2d(
                robot.getVec().add(new Vec2d(0, -DEPTH / 2).rot(90 - robot.direction)), 
                new Vec2d(SIZE, SIZE-DEPTH), 
                90 - robot.direction
            ),
            new Box2d(
                robot.getVec().add(new Vec2d(SIZE / 2 - (SIZE-WIDTH)/2 / 2, SIZE / 2-DEPTH / 2).rot(90 - robot.direction)), 
                new Vec2d((SIZE-WIDTH)/2, DEPTH), 
                90 - robot.direction
            ),
            new Box2d(
                robot.getVec().add(new Vec2d(-SIZE / 2 + (SIZE-WIDTH)/2 / 2, SIZE / 2-DEPTH / 2).rot(90 - robot.direction)), 
                new Vec2d((SIZE-WIDTH)/2, DEPTH), 
                90 - robot.direction
            )
        ]
    }
    getBoxIntake()
    {
        const robot = this.getRobot()

        if(!robot) return null

        const SIZE = IcarusExtension.ROBOT_SIZE * robot.size / 100
        const DEPTH = IcarusExtension.INTAKE_DEPTH * robot.size / 100
        const WIDTH = IcarusExtension.INTAKE_WIDTH * robot.size / 100

        return new Box2d(
            robot.getVec().add(new Vec2d(0, SIZE / 2 - DEPTH / 2).rot(90 - robot.direction)), 
            new Vec2d(WIDTH, DEPTH), 
            90 - robot.direction
        )
    }

    static ROBOT_SIZE = 140
    static INTAKE_DEPTH = 60
    static INTAKE_WIDTH = 100
    static CUBE_SIZE = 20
    static STINGER_SIZE = 245

    static INTAKE_SHOOT = 25

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

    static CHARGE_STATION = new AABB(new Vec2d(-10, 0), new Vec2d(70, 120))

    update()
    {
        const robot = this.getRobot()
        const cubes = this.getGamePieces()
        const visionCone = this.getVisionCone()

        if(!robot || !cubes || !visionCone) return

        this.calculated_cube = null

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

        const steps = Math.max(1, Math.min(10, Math.ceil(this.vel.length / 3)))
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

        // handle collisions
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

            // Push cubes away if necessary
            if(this.vel.length > 0.1 || Math.abs(this.omega) > 0.1)
            {
                const collisionBoxes = this.getBoxesWithoutIntake()

                for(const cube of cubes)
                {
                    let cubeBox = new Box2d(
                        new Vec2d(cube.x, cube.y), 
                        new Vec2d(IcarusExtension.CUBE_SIZE * cube.size / 100, IcarusExtension.CUBE_SIZE * cube.size / 100), 
                        90 - cube.direction
                    )

                    // todo: be better
                    while(true)
                    {
                        let anyHit = false
                        for(const colBox of collisionBoxes)
                        {
                            if(colBox.intersect(cubeBox))
                            {
                                anyHit = true

                                while(colBox.intersect(cubeBox))
                                {
                                    const nvec = cube.getVec().sub(colBox.center).norm.add(cube.getVec())

                                    cube.x = nvec.x
                                    cube.y = nvec.y

                                    cubeBox = new Box2d(
                                        new Vec2d(cube.x, cube.y), 
                                        new Vec2d(IcarusExtension.CUBE_SIZE * cube.size / 100, IcarusExtension.CUBE_SIZE * cube.size / 100), 
                                        90 - cube.direction
                                    )
                                }

                                break
                            }
                        }

                        if(!anyHit) break
                    }

                    cube.setXY(cube.x, cube.y)
                }
            }

            if(hitBoundary) break
        }
        
        robot.setXY(robot.x, robot.y)
        robot.setDirection(robot.direction)
        
        // Grab new pieces if necessary
        if(this.grabber_grab && !this.last_grabber_grab)
        {
            const intakeBox = this.getBoxIntake()

            for(const cube of cubes)
            {
                const cubeBox = new Box2d(
                    new Vec2d(cube.x, cube.y), 
                    new Vec2d(IcarusExtension.CUBE_SIZE * cube.size / 100, IcarusExtension.CUBE_SIZE * cube.size / 100), 
                    90 - cube.direction
                )

                console.log('CUBES')
                console.log(cube)

                if(intakeBox.intersect(cubeBox))
                {
                    this.held_piece = cube
                    this.held_piece_dir_off = cube.direction - robot.direction
                }
            }
        }
        // Release pieces
        else if(!this.grabber_grab && this.last_grabber_grab)
        {
            if(this.held_piece && !this.stinger_out)
            {
                const nvec = this.held_piece.getVec().add(new Vec2d(0, IcarusExtension.INTAKE_SHOOT).rot(90 - robot.direction))
                this.held_piece.setXY(nvec.x, nvec.y)
            }

            this.held_piece = null
        }
        // Adjust held piece
        else if(this.held_piece)
        {
            let offset = new Vec2d(0, (IcarusExtension.ROBOT_SIZE / 2 - IcarusExtension.INTAKE_DEPTH * 0.5) * robot.size / 100)

            if(this.stinger_out) 
            {
                offset = new Vec2d(0, IcarusExtension.STINGER_SIZE * robot.size / 100)
            }

            const vec = robot.getVec().add(offset.rot(90 - robot.direction))
            const dir = robot.direction + this.held_piece_dir_off

            this.held_piece.setXY(vec.x, vec.y)
            this.held_piece.setDirection(dir)
        }

        this.last_grabber_grab = this.grabber_grab

        visionCone.setVisible(true)
        if(this.vision_active)
        {
            visionCone.setEffect('ghost', 50)
            const nvec = robot.getVec().add(new Vec2d(0, 80).rot(90 - robot.direction))
            visionCone.setXY(nvec.x, nvec.y)
            visionCone.setDirection(robot.direction - 90)
        }
        else
        {
            visionCone.setEffect('ghost', 100)
        }

        this.docked = !!IcarusExtension.CHARGE_STATION.intersect(this.getBox())
        this.engaged = this.docked && Math.abs(robot.x - IcarusExtension.CHARGE_STATION.center.x) < 5

        if(this.engaged)
        {
            this.runtime.getTargetForStage().setCostume(Engaged)
        }
        else 
        {
            this.runtime.getTargetForStage().setCostume(NotEngaged)
        }
    }

    spinToAngle({X}, util)
    {
        const x = Cast.toNumber(X)

        const robot = this.getRobot()
        if(!robot) return

        const angDiff = angleDifference(x, robot.direction)

        if(Math.abs(angDiff) < 2 && Math.abs(this.omega) < 0.5)
        {
            return
        }
        else 
        {
            this.target_omega = MathUtil.clamp(angDiff / 6, -20, 20)
            util.yield()
        }
    }

    calculateVision()
    {
        if(this.calculated_cube) return this.calculated_cube

        if(!this.vision_active) return (this.calculated_cube = null)

        const robot = this.getRobot()
        const cubes = this.getGamePieces()

        if(!robot || !cubes) return (this.calculated_cube = null)

        let final = null
        let minDist = 500
        let angle = 0

        for(const cube of cubes)
        {
            const dx = cube.x - robot.x
            const dy = cube.y - robot.y
            const thisAngle = -angleDifference(robot.direction - 90, 90 - MathUtil.radToDeg(Math.atan2(dy, dx)));

            if(Math.abs(thisAngle) < 27)
            {
                const dist = new Vec2d(dx, dy).length
                if(dist < minDist)
                {
                    angle = thisAngle
                    minDist = dist
                    final = cube
                }
            }
        }

        return final ? (this.calculated_cube = {cube: final, angle: angle}) : (this.calculated_cube = null)
    }

    visionAngle()
    {
        const angle = this.calculateVision()?.angle
        return angle ? angle : 0
    }
    spinToCube({}, util)
    {
        const robot = this.getRobot();
        if(!robot) return

        if(typeof util.stackFrame.spinTargetAngle === 'undefined')
        {
            util.stackFrame.spinTargetAngle = robot.direction + this.visionAngle()
        }

        this.spinToAngle({X: util.stackFrame.spinTargetAngle}, util)

        if(util.thread.status !== Thread.STATUS_YIELD)
        {
            util.stackFrame.spinTargetAngle = undefined
        }
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

    getVisionActive() {return this.vision_active}
    visionOn() {this.vision_active = true}
    visionOff() {this.vision_active = false}

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