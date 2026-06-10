<div align="center">
  <h1>Topology Path Editor</h1>
</div>

<p align="center">
  <a href="README.md">English</a> •
  <a href="README.zh-CN.md">简体中文</a> •
</p>

<p align="center">
A single-page React + Three.js application for visualizing point-cloud maps and editing topology nodes, edges, and generated path points.
</p>

## Features

- Load point-cloud/map files:
  - PCD ASCII/Binary
  - ASCII PLY
  - XYZ/TXT/CSV point lists
- Load topology JSON files with:
  - `topology_nodes`
  - `edges`
  - `path_points`
- Display the map and topology in a 3D Three.js scene.
- Drag topology nodes and update their `x`, `y`, `z` values.
- Add/delete topology nodes.
- Drag nodes in the node list to reorder them and renumber node IDs.
- Edit a selected node ID manually; if the target ID already exists, that node and following nodes are shifted forward.
- After nodes are added, deleted, reordered, or renumbered, edges are rebuilt in node order; paths with matching endpoints are preserved, and only new or affected edges get generated points.
- Add/delete edges.
- Edit node type values.
- Default node types:
  - `charge`
  - `junction`
  - `elevator`
  - `stair`
- Add/delete custom node types.
- Generate edge `path_points` by interpolation.
- Adjust interpolation spacing, default `0.2m`.
- Lock selected edges so the `path_points` between those two topo points are preserved while editing other content.
- Add temporary topo points on an edge to control path turns.
- Edit/delete individual path points.
- Convert an inner edge path point into a real topo point; the original edge is split at that point.
- Convert a topo point with exactly two unlocked connected edges back into a normal path point; the adjacent edges are merged.
- Undo the previous operation.
- Open a history panel and restore any recorded edit step.
- Choose the page and 3D scene background color, default dark.
- Manually adjust the rendered 3D point cloud size and color.
- Switch the camera to any cube-face viewpoint: top, bottom, front, back, left, or right.
- Export updated topology JSON.

## Install

```bash
cd /topology-path-editor
npm install
```

## Run(Specify port)

```bash
npm run dev -- --port 8080
```

Open:

```text
http://localhost:8080/
```

## Run(No port specified)

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview -- --port 4173
```

## Render Verification

The project includes a small headless Chrome smoke test that loads the sample `floor2.json`, renders the WebGL canvas on desktop/mobile viewports, and checks that the canvas is not blank.

```bash
npm run verify:render
```

Screenshots are written to:

```text
/tmp/topology-editor-desktop.png
/tmp/topology-editor-mobile.png
```

If Chrome is not at `/usr/bin/google-chrome`, set:

```bash
CHROME_BIN=/path/to/chrome npm run verify:render
```

## JSON Format

Expected input/output shape:

```json
{
  "metadata": {
    "scene": "scene",
    "distance_threshold": 0.2,
    "total_topology_nodes": 2,
    "total_edges": 1,
    "total_path_points": 11
  },
  "topology_nodes": [
    {
      "id": 0,
      "x": 0,
      "y": 0,
      "z": 0,
      "type": "charge"
    },
    {
      "id": 1,
      "x": 2,
      "y": 0,
      "z": 0,
      "type": "junction"
    }
  ],
  "edges": [
    {
      "from": 0,
      "to": 1,
      "path_points": [
        {
          "seq": 1,
          "x": 0,
          "y": 0,
          "z": 0
        }
      ]
    }
  ]
}
```

## Temporary Topo Points

Temporary topo points are internal edge control points. They are useful when an edge should bend between two normal topology nodes.

Behavior:

- They are shown in the 3D scene as orange diamond points.
- They can be added from the selected edge panel with `Add Temp Point`.
- They can be dragged in the 3D view.
- They participate in interpolation as:

```text
from node -> temporary topo points -> to node
```

Export behavior:

- Temporary topo points are not exported as `topology_nodes`.
- The internal `temporary_points` field is stripped from exported edges.
- Their effect is preserved through the generated edge `path_points`.

## Path Locks

Select an edge and enable `Path lock` in the edge panel. While locked:

- Moving other topo points, adding nodes, or changing temporary points on other edges leaves this edge's `path_points` unchanged.
- Global path regeneration and spacing changes skip the locked edge.
- Unlock the edge before editing its temporary topo points, manual path points, or regenerating that edge.

## Path Point / Topo Point Conversion

- Select an edge and use the convert button in the `Path points` list to turn an inner path point into a topo point.
- The first and last path points already represent topo points, so only inner path points can be converted.
- Converting a path point splits the original edge into two edges and preserves the path points and temporary topo points on each side.
- Select a topo point and click `Convert to Path Point` to turn it back into a normal path point.
- A topo point can be converted back only when it has exactly two connected unlocked edges; those edges are merged into one edge.

## Editing Workflow

1. Load a map file.
2. Load a topology JSON file.
3. Select nodes or edges from the left panel or 3D scene.
4. Drag nodes or temporary topo points in the 3D scene.
5. Drag nodes inside the `Nodes` list if you need to reorder and renumber node IDs.
6. Adjust spacing to regenerate interpolated paths.
7. Use `Undo` or `History` if you need to roll back.
8. Change the background color, point-cloud size, point-cloud color, or cube-face viewpoint from `Appearance` if needed.
9. Export the edited topology JSON.

## Notes

- Large PCD files are downsampled in the browser for responsive rendering.
- `binary_compressed` PCD is not supported by the lightweight built-in loader.
- Loading JSON preserves existing `path_points`; moving a node only regenerates connected unlocked edges, and moving a temporary point only regenerates that edge.
- If an input JSON contains node types outside the default set, those types are added to the type list automatically.
- Node ID changes update edge `from`/`to` references automatically.
- Node add/delete/reorder operations rebuild the edge list as an ordered chain of adjacent nodes.
