import { World, Cell } from './world';

let color = {
    elevation(cell: Cell): string {
        let r = Math.round(255 * ((100 - cell.elevation) / 100));
        let g = Math.round(255 * (cell.elevation / 100));
        let b = 0;

        return `rgb(${r},${g},${b})`;
    },

    terrain(cell: Cell): string {
        let color = { r: 0, g: 0, b: 0, a: 0 };

        if (cell.terrain === 'water') {
            if (cell.elevation < 5) color = { r: 30, g: 79, b: 110, a: 0 };
            else if (cell.elevation < 15) color = { r: 69, g: 123, b: 157, a: 0 };
            else color = { r: 112, g: 162, b: 194, a: 0 };
        }
        else if (cell.terrain === 'sand') color = { r: 248, g: 252, b: 111, a: 0 };
        else if (cell.terrain === 'grass') {
            if (cell.elevation < 30) color = { r: 119, g: 207, b: 60, a: 0 };
            else if (cell.elevation < 70) color = { r: 97, g: 179, b: 41, a: 0 };
            else color = { r: 67, g: 138, b: 19, a: 0 };
        }
        else if (cell.terrain === 'rock') {
            if (cell.elevation > 98) color = { r: 232, g: 232, b: 232, a: 0 }; // snow
            else color = { r: 166, g: 162, b: 162, a: 0 };
        }

        // if (cell.populations.length > 1) {
        //     color.r = Math.round(color.r * 1.5);
        //     color.g = Math.round(color.g * 1.5);
        //     color.b = Math.round(color.b * 1.5);
        // }

        color.a = (cell.populations.length > 1) ? 0.25 : 1;

        return `rgba(${color.r},${color.g},${color.b},${color.a})`;
    }
};

const BOUNCE_BORDER: number = 25;

// Configuration options for the camera
export interface CameraOptions {
    showTerrain?: boolean;
    showWater?: boolean;
    moving?: boolean;
    // Index signature 
    [key: string]: boolean;
}

interface Camera {
    zoom: number;
    direction: { x: number, y: number };
    // Assume zoom @ 1.0
    offset: { x: number, y: number };
    // Assume zoom @ 1.0
    transform: { x: number, y: number };
    dims: { width: number, height: number, primary: number };
}

export class Renderer {
    world: World;
    canvas: HTMLCanvasElement = null;
    context: CanvasRenderingContext2D = null;

    options: CameraOptions = {
        showTerrain: true,
        showWater: true,
        moving: false,
    };
    camera: Camera;

    constructor(map: World, canvas: HTMLCanvasElement, options: CameraOptions) {
        this.world = map;
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.options = options;

        // maybe a good idea?
        this.camera.zoom = map.dim / 50;
        this.camera.direction.x /= this.camera.zoom;
        this.camera.direction.y /= this.camera.zoom;
        this.camera.dims.width = window.innerWidth;
        this.camera.dims.height = window.innerHeight;
        this.camera.dims.primary = Math.min(window.innerWidth, window.innerHeight),

        console.log(`rendering @ zoom=${this.camera.zoom}`);

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        if (this.options.moving) setInterval(this._bounce.bind(this), 25);

        window.requestAnimationFrame(this._renderFrame.bind(this));
        console.log('rendering started');
    }

    /**
     * Check if the provided cell is visible or not.
     */
    visible(cell: Cell) : boolean {
        let dimension = this.camera.zoom * this.camera.dims.primary / this.world.dim;

        let pixelX = cell.x * dimension;
        let pixelY = cell.y * dimension;

        // lower bound
        if (this.camera.transform.x > pixelX + dimension) return false;
        if (this.camera.transform.y > pixelY + dimension) return false;

        // upper bound
        if (this.camera.transform.x + this.camera.dims.width < pixelX) return false;
        if (this.camera.transform.y + this.camera.dims.height < pixelY) return false;

        return true;
    }

    _bounce() : void {
        // If disabled or in a background tab, don't advance. Don't advance in background
        // tab because it'll get out of sync with animation (which only occurs in the foreground).
        if (!this.options.moving || document.hidden) return;

        let targetX = this.camera.direction.x + this.camera.transform.x + this.camera.offset.x;
        let targetY = this.camera.direction.y + this.camera.transform.y + this.camera.offset.y;

        // lower limit
        if (targetX < -1 * BOUNCE_BORDER && this.camera.direction.x < 0) this.camera.direction.x *= -1;
        if (targetY < -1 * BOUNCE_BORDER && this.camera.direction.y < 0) this.camera.direction.y *= -1;

        // upper limit
        if (targetX > this.camera.dims.primary * this.camera.zoom - this.camera.dims.width + BOUNCE_BORDER) this.camera.direction.x *= -1;
        if (targetY > this.camera.dims.primary * this.camera.zoom - this.camera.dims.height + BOUNCE_BORDER) this.camera.direction.y *= -1;

        this.camera.offset.x += this.camera.direction.x;
        this.camera.offset.y += this.camera.direction.y;
    }

    /**
     * Renders an individual frame. The goal is to call this function 60 times per second.
     */
    _renderFrame() {
        let self = this;
        let dimension = Math.floor(this.camera.zoom * this.camera.dims.primary / this.world.dim);

        // clear the canvas
        // todo: zoom multipliers
        self.context.clearRect(
            this.camera.transform.x,
            this.camera.transform.y,
            this.camera.dims.width,
            this.camera.dims.height
        );

        // apply and store the translation
        if (this.camera.offset.x !== 0 || this.camera.offset.y !== 0) {
            // translate moves in the opposite direction vs what i would expect (as someone not great at
            // linear algebra). invert directions here so that i can use intuitive directions elsewhere.
            this.context.translate(-1 * this.camera.offset.x, -1 * this.camera.offset.y);

            this.camera.transform.x += this.camera.offset.x;
            this.camera.transform.y += this.camera.offset.y;

            this.camera.offset.x = 0;
            this.camera.offset.y = 0;
        }

        // render the visible items
        this.world.grid.filter(this.visible.bind(this)).forEach(function (cell) {
            if (self.options.showTerrain) self.context.fillStyle = color.terrain(cell)
            else self.context.fillStyle = color.elevation(cell);

            self.context.fillRect(cell.x * dimension + 1, cell.y * dimension + 1, dimension - 2, dimension - 2);
        });

        window.requestAnimationFrame(this._renderFrame.bind(this));
    }

    update(options : CameraOptions) {
        for (let prop in options) {
            this.options[prop] = options[prop];
        }
    }
}
