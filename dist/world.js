"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// let _ = require('lodash');
// import { shuffle } from 'lodash';
// import { Population, RenewablePopulation } from './species';
var terrain_1 = require("./terrain");
// How much elevation should randomly vary from its surroundings.
var ELEVATION_NOISE_LEVEL = 7;
var AQUIFER_DEPTH = 35;
var World = /** @class */ (function () {
    function World(dim) {
        this.grid = [];
        // populations: Array<Population> = [];     // Living populations
        this.extinctions = 0;
        // The depth of the aquifer in the world (anything beneath this depth becomes
        // a water tile).
        this.aquiferDepth = AQUIFER_DEPTH;
        this.dim = dim;
        for (var y = 0; y < dim; y++) {
            for (var x = 0; x < dim; x++) {
                var cell = new Cell(x, y);
                cell.world = this;
                this.grid.push(cell);
            }
        }
    }
    World.prototype.init = function (_a) {
        // sunshine(this);
        var update = _a.update;
        // let checkpoint = Date.now();
        // let timing = {};
        var steps = [
            generateElevations.bind(null, this),
            aquifer.bind(null, this),
            rainfall.bind(null, this),
            evaporate.bind(null, this),
            terrainify.bind(null, this),
            smoothTerrain.bind(null, this),
        ];
        // Run all steps
        return steps.reduce(function (promise, next) {
            return promise.then(function () {
                next();
                return update();
            });
        }, Promise.resolve());
    };
    ;
    /**
     * Remove a population from the global list if it becomes extinct. This function should
     * usually be invoked from the cell first (which will automatically call it on the World
     * as well).
     *
     * @param {Population} the population to remove
     */
    // extinguish(pop: Population): void {
    //     this.populations = this.populations.filter(p => p.id !== pop.id);
    //     this.extinctions++;
    //     console.log(`A population of ${pop.name} became part of the earth.`);
    // }
    /**
     * Finds and returns a particular Cell (or Location). A Cell emulator is not a real cell
     * object but contains most of the important properties; they simulate wraparound and other
     * effects for terrain generation.
     *
     * @param {number} x coordinate
     * @param {number} y coordinate
     * @returns {Location} containing (at least) x, y, and elevation properties
     */
    World.prototype.find = function (x, y) {
        // Inherit elevation (and potentially other properties, if needed) from out-of-bounds
        // cells. Coordinates (even if out of bounds) remain intact.
        if (x < 0 || x >= this.dim) {
            var realCell = (x < 0) ? this.find(this.dim - x, y) : this.find(x - this.dim, y);
            return { x: x, y: y, elevation: realCell.elevation };
        }
        if (y < 0 || y >= this.dim) {
            var realCell = (y < 0) ? this.find(x, this.dim - y) : this.find(x, y - this.dim);
            return { x: x, y: y, elevation: realCell.elevation };
        }
        return this.grid[y * this.dim + x];
    };
    // TODO: ambiguity issue between Location and Cell
    World.prototype.neighbors = function (cell) {
        var neighbors = [];
        if (cell.x - 1 >= 0)
            neighbors.push(this.find(cell.x - 1, cell.y));
        if (cell.y - 1 >= 0)
            neighbors.push(this.find(cell.x, cell.y - 1));
        if (cell.x + 1 < this.dim)
            neighbors.push(this.find(cell.x + 1, cell.y));
        if (cell.y + 1 < this.dim)
            neighbors.push(this.find(cell.x, cell.y + 1));
        return neighbors;
    };
    return World;
}());
exports.World = World;
/**
 * World generation functions. These functions are related to generating the *initial state* of the world
 * less than evolutions beyond the initial state. They primarily revolve around terrain generation, watersheds,
 * terrain types, and so on.
 */
// New version greatly influenced / copied from this article:
//   http://www.playfuljs.com/realistic-terrain-in-130-lines/
function generateElevations(world) {
    var full = world.dim - 1;
    function divide(size, variance) {
        var half = size / 2;
        // Base case
        if (half < 1)
            return;
        for (var y = half; y < full; y += size) {
            for (var x = half; x < full; x += size) {
                square(x, y, half, variance);
            }
        }
        for (var y = 0; y <= full; y += half) {
            for (var x = (y + half) % size; x <= full; x += size) {
                diamond(x, y, half, variance);
            }
        }
        return divide(size / 2, variance * 0.9);
    }
    function square(x, y, half, variance) {
        var tl = world.find(x - half, y - half);
        var tr = world.find(x + half, y - half);
        var bl = world.find(x - half, y + half);
        var br = world.find(x + half, y + half);
        var avg = [tl, tr, bl, br].map(function (p) { return p.elevation / 4; }).reduce(function (a, b) { return a + b; });
        world.find(x, y).elevation = avg + (Math.random() - 0.5) * variance;
    }
    function diamond(x, y, half, variance) {
        var n = world.find(x, y - half);
        var e = world.find(x + half, y);
        var s = world.find(x, y + half);
        var w = world.find(x - half, y);
        var avg = [n, e, s, w].map(function (p) { return p.elevation / 4; }).reduce(function (a, b) { return a + b; });
        world.find(x, y).elevation = avg + (Math.random() - 0.5) * variance;
    }
    world.find(0, 0).elevation = Math.random() * 100;
    world.find(full, 0).elevation = Math.random() * 100;
    world.find(0, full).elevation = Math.random() * 100;
    world.find(full, full).elevation = Math.random() * 100;
    divide(full, 20);
}
function rainfall(world) {
    // todo: should return Cell but Location and Cell are getting too interwoven
    function drip(start) {
        var lowest = world.neighbors(start).reduce(function (lowest, next) {
            if (next.elevation < lowest.elevation && !next.water)
                return next;
            else
                return lowest;
        }, start);
        if (start.x === lowest.x && start.y === lowest.y)
            return start;
        else
            return drip(lowest);
    }
    // todo: replace this.dim * 2 with a world-level 'wetness' constant
    for (var i = 0; i < world.dim * 5; i++) {
        var x = Math.floor(Math.random() * world.dim);
        var y = Math.floor(Math.random() * world.dim);
        var lowest = drip(world.find(x, y));
        lowest.water = true;
    }
}
;
function aquifer(world) {
    world.grid.forEach(function (cell) {
        if (cell.elevation < world.aquiferDepth)
            cell.water = true;
    });
}
;
function evaporate(world) {
    world.grid.forEach(function (cell) {
        var count = world.neighbors(cell).filter(function (neighbor) { return neighbor.water; }).length;
        if (count === 0)
            cell.water = false;
    });
}
/**
 * Iteratively determine what terrain type each cell is. Terrainify will continue to iterate
 * over all cells until the terrain types of all cells are static for a full iteration.
 */
function terrainify(world) {
    var changed = true;
    var iteration = 1;
    while (changed) {
        changed = false;
        world.grid.forEach(function (cell) {
            var label = terrain_1.available.find(function (terr) { return terr.func(cell, world); }).label;
            if (cell.terrain !== label) {
                changed = true;
                cell.terrain = label;
            }
        });
        iteration++;
        // Stop after sqrt(dim) iterations for performance reasons.
        if (iteration > Math.sqrt(world.dim))
            return;
    }
}
function smoothTerrain(world) {
    var smoothed = 0;
    world.grid.forEach(function (cell) {
        var terrains = new Set(world.neighbors(cell).map(function (c) { return c.terrain; }));
        // If there's only one type of terrain around here, inherit it.
        if (terrains.size === 1) {
            var commonTerrain = terrains.values().next().value;
            if (cell.terrain !== commonTerrain) {
                cell.terrain = commonTerrain;
                if (cell.terrain === terrain_1.Terrain.WATER)
                    cell.water = true;
                smoothed += 1;
            }
        }
    });
    console.log("Cells smoothed: " + smoothed + " / " + world.dim * world.dim + " (" + 100 * smoothed / (world.dim * world.dim) + "%)");
}
// function sunshine(world: World): void {
//     world.grid.forEach(function (cell) {
//         let sun = new RenewablePopulation(cell, {
//             name: 'Brittney of the North',
//             type: 'energy',
//             population: 10,
//             stats: {
//                 mass: 10,
//             }
//         });
//     });
// }
var Cell = /** @class */ (function () {
    function Cell(x, y) {
        this.terrain = -1;
        this.elevation = 0;
        this.water = false;
        this.x = x;
        this.y = y;
    }
    return Cell;
}());
exports.Cell = Cell;
