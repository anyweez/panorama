/// <reference path="../typings/modules/lodash/index.d.ts" />

// let _ = require('lodash');
import { shuffle } from 'lodash';
import { Population, RenewablePopulation } from './species';

// How much elevation should randomly vary from its surroundings.
const ELEVATION_NOISE_LEVEL = 7;
const AQUIFER_DEPTH = 35;

/**
 * Represents a Cell or Cell-like object that marks a point in the world
 */
interface Location {
    x: number;
    y: number;
    elevation: number;
}

export class World {
    dim: number;
    grid: Array<Cell>;
    populations: Array<Population>;     // Living populations
    extinctions: number = 0;
    // The depth of the aquifer in the world (anything beneath this depth becomes
    // a water tile).
    aquiferDepth: number = AQUIFER_DEPTH;

    constructor(dim: number) {
        this.dim = dim;

        for (let y = 0; y < dim; y++) {
            for (let x = 0; x < dim; x++) {
                let cell = new Cell(x, y);
                cell.world = this;

                this.grid.push(cell);
            }
        }

        generateElevations(this);
    }

    init({ update } : { update: Function }) {
        sunshine.bind(null, this);

        let checkpoint = Date.now();
        let timing = {};

        let jobs = [
            generateElevations.bind(null, this),
            aquifer.bind(null, this),
            rainfall.bind(null, this),
            evaporate.bind(null, this),
            terrainify.bind(null, this),
            smoothTerrain.bind(null, this),
        ];

        // Run all jobs
        return jobs.reduce((promise, next) => {
            return promise.then(() => {
                next();
                return update();
            });
        }, Promise.resolve());
    };

    /**
     * Remove a population from the global list if it becomes extinct. This function should 
     * usually be invoked from the cell first (which will automatically call it on the World 
     * as well).
     * 
     * @param {Population} the population to remove
     */
    extinguish(pop: Population): void {
        this.populations = this.populations.filter(p => p.id !== pop.id);
        this.extinctions++;
    }

    /**
     * Finds and returns a particular Cell (or Location). A Cell emulator is not a real cell 
     * object but contains most of the important properties; they simulate wraparound and other 
     * effects for terrain generation.
     *  
     * @param {number} x coordinate
     * @param {number} y coordinate
     * @returns {Location} containing (at least) x, y, and elevation properties
     */
    find(x: number, y: number): Location {
        // Inherit elevation (and potentially other properties, if needed) from out-of-bounds
        // cells. Coordinates (even if out of bounds) remain intact.
        if (x < 0 || x >= this.dim) {
            let realCell = (x < 0) ? this.find(this.dim - x, y) : this.find(x - this.dim, y);

            return { x: x, y: y, elevation: realCell.elevation };
        }

        if (y < 0 || y >= this.dim) {
            let realCell = (y < 0) ? this.find(x, this.dim - y) : this.find(x, y - this.dim);

            return { x: x, y: y, elevation: realCell.elevation };
        }

        return this.grid[y * this.dim + x];
    }

    neighbors(cell: Location): Array<any> {
        let neighbors: Array<any> = [];

        if (cell.x - 1 >= 0) neighbors.push(this.find(cell.x - 1, cell.y));
        if (cell.y - 1 >= 0) neighbors.push(this.find(cell.x, cell.y - 1));
        if (cell.x + 1 < this.dim) neighbors.push(this.find(cell.x + 1, cell.y));
        if (cell.y + 1 < this.dim) neighbors.push(this.find(cell.x, cell.y + 1));

        return neighbors;
    }

    /**
     * Iterate through one 'cycle' of the world. Currently this just calls step() on each
     * population, though the idea of a world cycle is based around a randomly ordered
     * task queue that can support tasks of any type.
     * 
     * It's currently important that the order of events is random so that certain populations
     * don't get the advantage on eating, etc just because they're listed first in the array.
     */
    cycle(): void {
        console.log('running cycle');

        let tasks: Array<Function> = [];
        // // Every population should take a step
        this.populations.forEach(pop => tasks.push(pop.step.bind(pop)));
        // // Call each function in a random order.
        shuffle(tasks).forEach(pop => pop());

        // // Now run each populations end() function to finish the turn
        tasks = [];
        this.populations.forEach(pop => tasks.push(pop.end.bind(pop)));
        // // Call each function in a random order.
        shuffle(tasks).forEach(pop => pop());
    }
}
/**
 * World generation functions. These functions are related to generating the *initial state* of the world 
 * less than evolutions beyond the initial state. They primarily revolve around terrain generation, watersheds,
 * terrain types, and so on.
 */

// New version greatly influenced / copied from this article:
//   http://www.playfuljs.com/realistic-terrain-in-130-lines/
function generateElevations(world: World) : void {
    let full = this.dim - 1;

    function divide(size: number, variance: number) : void {
        let half = size / 2;

        // Base case
        if (half < 1) return;

        for (let y = half; y < full; y += size) {
            for (let x = half; x < full; x += size) {
                square(x, y, half, variance);
            }
        }

        for (let y = 0; y <= full; y += half) {
            for (let x = (y + half) % size; x <= full; x += size) {
                diamond(x, y, half, variance);
            }
        }

        return divide(size / 2, variance * 0.9);
    }

    function square(x: number, y: number, half: number, variance: number) : void {
        let tl = world.find(x - half, y - half);
        let tr = world.find(x + half, y - half);
        let bl = world.find(x - half, y + half);
        let br = world.find(x + half, y + half);

        let avg = [tl, tr, bl, br].map(p => p.elevation / 4).reduce((a, b) => a + b);

        world.find(x, y).elevation = avg + (Math.random() - 0.5) * variance;
    }

    function diamond(x: number, y: number, half: number, variance: number) : void {
        let n = world.find(x, y - half);
        let e = world.find(x + half, y);
        let s = world.find(x, y + half);
        let w = world.find(x - half, y);

        let avg = [n, e, s, w].map(p => p.elevation / 4).reduce((a, b) => a + b);

        world.find(x, y).elevation = avg + (Math.random() - 0.5) * variance;
    }

    world.find(0, 0).elevation = Math.random() * 100;
    world.find(full, 0).elevation = Math.random() * 100;
    world.find(0, full).elevation = Math.random() * 100;
    world.find(full, full).elevation = Math.random() * 100;

    divide(full, 20);
}

function rainfall(world: World) {
    // todo: should return Cell but Location and Cell are getting too interwoven
    function drip(start: Location) : any {
        let lowest = world.neighbors(start).reduce((lowest, next) => {
            if (next.elevation < lowest.elevation && !next.water) return next;
            else return lowest;
        }, start);

        if (start.x === lowest.x && start.y === lowest.y) return start;
        else return drip(lowest);
    }

    // todo: replace this.dim * 2 with a world-level 'wetness' constant
    for (let i = 0; i < world.dim * 5; i++) {
        let x = Math.floor(Math.random() * world.dim);
        let y = Math.floor(Math.random() * world.dim);

        let lowest = drip(world.find(x, y));
        lowest.water = true;
    }
};

function aquifer(world: World) {
    world.grid.forEach(cell => {
        if (cell.elevation < world.aquiferDepth) cell.water = true;
    });
};

function evaporate(world: World) {
    world.grid.forEach(cell => {
        let count = world.neighbors(cell).filter(neighbor => neighbor.water).length;
        if (count === 0) cell.water = false;
    });
}

/**
 * Iteratively determine what terrain type each cell is. Terrainify will continue to iterate
 * over all cells until the terrain types of all cells are static for a full iteration.
 */
function terrainify(world: World): void {
    let changed = true;
    let iteration = 1;

    while (changed) {
        changed = false;

        world.grid.forEach(cell => {
            let label = availableTerrains.find(terr => terr.func(cell, this)).label;

            if (cell.terrain !== label) {
                changed = true;
                cell.terrain = label;
            }
        });

        iteration++;

        // Stop after sqrt(dim) iterations for performance reasons.
        if (iteration > Math.sqrt(this.dim)) return;
    }
}

function smoothTerrain(world: World): void {
    let smoothed = 0;

    world.grid.forEach(cell => {
        let terrains = new Set(world.neighbors(cell).map(c => c.terrain));

        // If there's only one type of terrain around here, inherit it.
        if (terrains.size === 1) {
            let commonTerrain = terrains.values().next().value;

            if (cell.terrain !== commonTerrain) {
                cell.terrain = commonTerrain;
                if (cell.terrain === 'water') cell.water = true;
                smoothed += 1;
            }
        }
    });

    console.log(`Cells smoothed: ${smoothed} / ${world.dim * world.dim} (${100 * smoothed / (world.dim * world.dim)}%)`);
}

function sunshine(world: World): void {
    world.grid.forEach(function (cell) {
        let sun = new RenewablePopulation(cell, {
            name: 'Sunshine',
            type: 'energy',
            population: 10,
            stats: {
                mass: 10,
            }
        });
    });
}

// World.prototype.spawnNext = function () {
//     let i = Math.floor(Math.random() * this.grid.length);
//     let population = new Population(this.grid[i]);

//     console.log(`Spawned ${population.name} at (${this.grid[i].x}, ${this.grid[i].y})`)
// }

export class Cell implements Location {
    x: number;
    y: number;
    terrain: string = null;
    elevation: number = 0;
    water: boolean = false;
    populations: Array<Population>;
    world: World;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    /**
     * Add a new population to the cell. Automatically invokes the same function on the world that
     * the cell is a part of as well. Note that a population can only be present on a single cell
     * at a time so this will generate an exception if the population already has a home.
     * 
     * @param {Population} the population to add
     * @throws {Exception} if the population already exists in a cell
     */
    spawn(pop: Population) {
        if (pop.home !== null) throw Error(`Population ${pop.name} already has a home.`);

        this.populations.push(pop);
        this.world.populations.push(pop);
    }

    /**
     * Remove the specified population from the cell. Automatically invokes the same function on
     * the world that the cell is a part of as well.
     * 
     * @param {Population} the population to remove
     */
    extinguish(pop: Population) {
        pop.home = null;

        this.populations = this.populations.filter(p => p.id !== pop.id);
        this.world.extinguish(pop);
    }
}

let availableTerrains = [{
    label: 'water',
    func: function (cell: Cell, world: World) : boolean { return cell.water; }
}, {
        label: 'sand',
        func: function (cell: Cell, world: World) : boolean {
            let valid = world.neighbors(cell).filter(cell => cell.water || cell.terrain === 'sand').length > 0;
            return valid && cell.elevation - world.aquiferDepth < 10;
        }
    }, {
        label: 'rock',
        func: function (cell: Cell, world: World) : boolean {
            return cell.elevation > 90;
        }
    }, {
        // grass is the default unless terrain has another label
        label: 'grass',
        func: function (cell: Cell, world: World) : boolean {
            return true;
        }
    }
];