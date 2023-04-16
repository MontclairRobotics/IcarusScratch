import { forEach } from 'jszip';
import RenderedTarget from '../sprites/rendered-target';

const Runtime = require('../engine/runtime');
const Target = require('../engine/target');
const MathUtil = require('../util/math-util');
const BlockUtility = require('../engine/block-utility');
const Thread = require('../engine/thread');

export function trapezoidEvolve(current, target, max_delta, dt)
{
    if(current instanceof Vec2d)
    {
        return new Vec2d(
            trapezoidEvolve(current.x, target.x, max_delta, dt),
            trapezoidEvolve(current.y, target.y, max_delta, dt)
        )
    }

    return MathUtil.clamp(target, current - max_delta*dt, current + max_delta*dt)
}

export function angleDifference(a, b)
{
    // https://stackoverflow.com/questions/1878907/how-can-i-find-the-smallest-difference-between-two-angles-around-a-point s
    let t = a - b
    if(t > 180) t -= 360
    if(t < -180) t += 360

    return t
}

export class Polygon2d
{
    /**
     * @param {Vec2d[]} points 
     * @returns {LineSegment2d[]}
     */
    static toSegments(points)
    {
        if(points.length < 2) return []
        if(points.length === 2) return [new LineSegment2d(points[0], points[1])]
        return points.map((p, i) => new LineSegment2d(p, points[(i+1) % points.length]))
    }

    /**
     * @param {Vec2d[]} points 
     */
    constructor(points)
    {
        if(!points) points = []

        /**
         * @type {Vec2d[]}
         */
        this._points = points
        /**
         * @type {LineSegment2d[]}
         */
        this._segments = Polygon2d.toSegments(points)
    }

    get points() {return this._points}
    get segments() {return this._segments}

    set points(p) 
    {
        this._points = p
        this._segments = Polygon2d.toSegments(p)
    }

    /**
     * @param {Polygon2d} other 
     * @returns {?Vec2d}
     */
    shell_intersect(other)
    {
        const options = this.segments.flatMap(a => other.segments.map(b => [a, b]))
        for (const [a, b] of options) 
        {
            const intersect = a.intersect(b)
            if(intersect) 
            {
                // console.log(intersect)
                return intersect
            }
        }
        return null
    }
}

export class AABB extends Polygon2d
{
    /**
     * @param {Vec2d} min 
     * @param {Vec2d} size 
     */
    static minAndSize(min, size)
    {
        return new AABB(min.add(size.div(2)), size)
    }

    /**
     * @param {Vec2d} center 
     * @param {Vec2d} size 
     */
    constructor(center, size, _initializePoints)
    {
        super()

        /**
         * @type {Vec2d}
         */
        this.center = center
        /**
         * @type {Vec2d}
         */
        this.size = size

        if(_initializePoints !== false) 
            super.points = this.corners
    }

    get _min() {return this.center.sub(this.size.div(2))}
    get _max() {return this.center.add(this.size.div(2))}

    /**
     * @type {Vec2d[]}
     */
    get corners() {return [this._max, new Vec2d(this._max.x, this._min.y), this._min, new Vec2d(this._min.x, this._max.y)]}

    /**
     * @param {Vec2d} point 
     * @returns {boolean}
     */
    contains(point)
    {
        return (this._min.x < point.x && point.x < this._max.x)
            && (this._min.y < point.y && point.y < this._max.y);
    }

    /**
     * @param {Polygon2d} other 
     */
    intersect(other)
    {
        return this.shell_intersect(other) || other.points.some(p => this.contains(p))
    }
}

export class Box2d extends AABB
{
    /**
     * @param {Vec2d} center 
     * @param {Vec2d} size 
     * @param {number} rotation 
     */
    constructor(center, size, rotation)
    {
        super(center, size, false)

        /**
         * @type {number}
         */
        this.rotation = rotation

        super.points = this.corners
    }

    get corners()
    {
        return super.corners.map(corner => corner.rot(this.rotation, this.center))
    }

    /**
     * @param {Vec2d} point 
     */
    contains(point)
    {
        return super.contains(point.rot(-this.rotation, this.center))
    }
}

export class Vec2d
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

    toString()
    {
        return `(${this.x}, ${this.y})`
    }

    /**
     * @returns {Vec2d}
     */
    static get zero()
    {
        return new Vec2d(0, 0)
    }

    /**
     * @param {Vec2d} other 
     * @returns {number}
     */
    dot(other)
    {
        return this.x * other.x + this.y + other.y
    }

    /**
     * @param {Vec2d} other 
     * @returns {Vec2d}
     */
    add(other)
    {
        return new Vec2d(this.x + other.x, this.y + other.y)
    }
    /**
     * @param {Vec2d} other 
     * @returns {Vec2d}
     */
    sub(other)
    {
        return new Vec2d(this.x - other.x, this.y - other.y)
    }
    /**
     * @param {number} other 
     * @returns {Vec2d}
     */
    mul(other)
    {
        return new Vec2d(this.x * other, this.y * other)
    }
    /**
     * @param {number} other 
     * @returns {Vec2d}
     */
    div(other)
    {
        return new Vec2d(this.x / other, this.y / other)
    }

    /**
     * @returns {Vec2d}
     */
    clone()
    {
        return new Vec2d(this.x, this.y)
    }

    /**
     * @returns {Vec2d}
     */
    get neg()
    {
        return new Vec2d(-this.x, -this.y)
    }

    /**
     * @returns {number}
     */
    get length()
    {
        return Math.hypot(this.x, this.y)
    }

    /**
     * @returns {Vec2d}
     */
    get norm()
    {
        const len = this.length
        return Math.abs(len) < 0.01 ? this.clone() : this.div(this.length)
    }

    /**
     * @param {number} deg 
     * @param {?Vec2d} center The origin if not provided
     * @returns {Vec2d}
     */
    rot(deg, center)
    {
        if(!center) center = Vec2d.zero

        const co = this.sub(center)
        const rad = MathUtil.degToRad(deg)
        const rot = new Vec2d(
            co.x * Math.cos(rad) - co.y * Math.sin(rad),
            co.x * Math.sin(rad) + co.y * Math.cos(rad)
        )

        return rot.add(center)
    }
}

export class LineSegment2d
{
    /**
     * @param {Vec2d} a 
     * @param {Vec2d} b 
     */
    constructor(a, b)
    {
        this.a = a
        this.b = b
    }

    /**
     * @param {LineSegment2d} other 
     * @returns {?Vec2d}
     */
    intersect(other)
    {
        let denom = (other.b.y - other.a.y)*(this.b.x - this.a.x) - (other.b.x - other.a.x)*(this.b.y - this.a.y);
        if (denom == 0) 
        {
            return null;
        }

        let ua = ((other.b.x - other.a.x)*(this.a.y - other.a.y) - (other.b.y - other.a.y)*(this.a.x - other.a.x)) / denom;
        let ub = ((this.b.x - this.a.x)*(this.a.y - other.a.y) - (this.b.y - this.a.y)*(this.a.x - other.a.x)) / denom;

        if(ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;

        return new Vec2d(
            this.a.x + ua * (this.b.x - this.a.x),
            this.a.y + ua * (this.b.y - this.a.y)
        );
    }
}

export class VirtualThread
{
    static get MODE_ONE_BLOCK() {return 0}
    static get MODE_THIS_LEVEL() {return 1}
    static get MODE_FULL_PROGRAM() {return 2}

    /**
     * @param {BlockUtility} util 
     * @param {number} runMode
     */
    constructor(util, runMode, ...stackAdds)
    {
        const startThread = util.thread
        const startBlock = stackAdds.length > 0 ? stackAdds[stackAdds.length-1] : util.thread.peekStack() 

        /**
         * @type {Runtime}
         */
        this.runtime = startThread.target.runtime
        /**
         * @type {Target}
         */
        this.target = startThread.target
        this._start_depth = startThread.stack.length + stackAdds.length
        
        /**
         * @type {Thread}
         */
        this._thread = new Thread(startBlock)
        
        startThread.stack.forEach(k => this._thread.pushStack(k))
        stackAdds        .forEach(k => this._thread.pushStack(k))

        this._thread.target = this.target
        this._thread.blockContainer = this.target.blocks

        this._runMode = runMode
        this._completed = false
    }

    get topBlock()  {return this._thread.topBlock}
    get completed() {return this._completed}

    /**
     * Step through the program
     * @param {BlockUtility} util 
     */
    step(util)
    {
        // Early return if we know there's nothing to run
        if(this._completed) return

        // Update block utility to match desired execution
        let utilThr = util.thread
        let activeThr = util.sequencer.activeThread

        util.thread = this._thread
        util.sequencer.activeThread = this._thread


        // If thread is still running, continue
        if(this._thread.status !== Thread.STATUS_DONE)
        {
            let depth = 0

            switch(this._runMode)
            {
                case VirtualThread.MODE_ONE_BLOCK:
                    depth = this._start_depth
                    break
                case VirtualThread.MODE_THIS_LEVEL:
                    depth = this._start_depth - 1
                    break
                case VirtualThread.MODE_FULL_PROGRAM:
                    depth = null
                    break
            }

            let endedLayer = util.sequencer.stepThread(this._thread, depth)
            
            // Check if single block has completed
            if(endedLayer)
            {
                // console.log('Completed by mode one block') 
                // console.log(this._thread)
                this._completed = true
            }
        }

        // Final check that code has not yet finished
        if(this._thread.status === Thread.STATUS_DONE)
        {
            // console.log('Completed by status done') 
            this._completed = true
        }
        
        // Restore state for this block utility
        util.thread = utilThr
        util.sequencer.activeThread = activeThr
    }
}

BlockUtility.prototype.getBranch = function (i) 
{
    return this.thread.blockContainer.getBranch(this.thread.peekStack(), i)
}

/**
 * @this {RenderedTarget}
 * @returns {Vec2d}
 */
RenderedTarget.prototype.getVec = function() {return new Vec2d(this.x, this.y)}

/**
 * @this {RenderedTarget}
 * @param {Vec2d} xy 
 */
RenderedTarget.prototype.setVec = function(xy) {
    this.x = xy.x
    this.y = xy.y
}