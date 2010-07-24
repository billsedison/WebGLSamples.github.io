/*
 * Copyright 2009, Google Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


/**
 * @fileoverview This file contains objects to make primitives.
 */

tdl.provide('tdl.primitives');

tdl.require('tdl.math');

/**
 * A module for primitives.
 * @namespace
 */
tdl.primitives = tdl.primitives || {};

/**
 * AttriBuffer manages a TypedArray as an array of vectors.
 *
 * @param {number} numComponents Number of components per
 *     vector.
 * @param {number} numElements Number of vectors.
 * @param {string} opt_type The type of the TypedArray to
 *     create. Default = 'Float32Array'.
 */
tdl.primitives.AttribBuffer = function(numComponents, numElements, opt_type) {
  opt_type = opt_type || 'Float32Array';
  var type = window[opt_type];
  this.buffer = new type(numComponents * numElements);
  this.cursor = 0;
  this.numComponents = numComponents;
  this.numElements = numElements;
};

tdl.primitives.AttribBuffer.prototype.stride = function() {
  return 0;
};

tdl.primitives.AttribBuffer.prototype.offset = function() {
  return 0;
};

tdl.primitives.AttribBuffer.prototype.getElement = function(index) {
  var offset = index * this.numComponents;
  var value = [];
  for (var ii = 0; ii < this.numComponents; ++ii) {
    value.push(this.buffer[offset + ii]);
  }
  return value;
};

tdl.primitives.AttribBuffer.prototype.setElement = function(index, value) {
  var offset = index * this.numComponents;
  for (var ii = 0; ii < this.numComponents; ++ii) {
    this.buffer[offset + ii] = value[ii];
  }
};

tdl.primitives.AttribBuffer.prototype.push = function(value) {
  this.setElement(this.cursor++, value);
};

/**
 * Reorients positions by the given matrix. In other words, it
 * multiplies each vertex by the given matrix.
 * @param {!tdl.primitives.AttribBuffer} array AttribBuffer to
 *     reorient.
 * @param {!tdl.math.Matrix4} matrix Matrix by which to
 *     multiply.
 */
tdl.primitives.reorientPositions = function(array, matrix) {
  var math = tdl.math;
  var matrixInverse = math.inverse(math.matrix4.getUpper3x3(matrix));

  var numElements = array.numElements;
  for (var ii = 0; ii < numElements; ++ii) {
    array.setElement(ii,
        math.matrix4.transformPoint(matrix,
            array.getElement(ii)));
  }
};

/**
 * Reorients normals by the inverse-transpose of the given
 * matrix..
 * @param {!tdl.primitives.AttribBuffer} array AttribBuffer to
 *     reorient.
 * @param {!tdl.math.Matrix4} matrix Matrix by which to
 *     multiply.
 */
tdl.primitives.reorientNormals = function(array, matrix) {
  var math = tdl.math;
  var matrixInverse = math.inverse(math.matrix4.getUpper3x3(matrix));

  var numElements = array.numElements();
  for (var ii = 0; ii < numElements; ++ii) {
    array.setElementVector(ii,
        math.matrix4.transformNormal(matrix,
            array.getElement(ii)));
  }
};

/**
 * Reorients directions by the given matrix..
 * @param {!tdl.primitives.AttribBuffer} array AttribBuffer to
 *     reorient.
 * @param {!tdl.math.Matrix4} matrix Matrix by which to
 *     multiply.
 */
tdl.primitives.reorientDirections = function(array, matrix) {
  var math = tdl.math;

  var numElements = array.numElements();
  for (var ii = 0; ii < numElements; ++ii) {
    array.setElement(ii,
        math.matrix4.transformDirection(matrix,
            array.getElement(ii)));
  }
};

/**
 * Reorients arrays by the given matrix. Assumes arrays have
 * names that start with 'position', 'normal', 'tangent',
 * 'binormal'
 *
 * @param {!Object.<string, !tdl.primitive.AttribBuffer>} arrays
 *        The arrays to remap.
 * @param {!tdl.math.Matrix4} matrix The matrix to remap by
 */
tdl.primitives.reorient = function(arrays, matrix) {
  for (var array in arrays) {
    if (array.match(/^position/)) {
      tdl.primitives.reorientPositions(arrays[array], matrix);
    } else if (array.match(/^normal/)) {
      tdl.primitives.reorientNormals(arrays[array], matrix);
    } else if (array.match(/^tangent/) || array.match(/^binormal/)) {
      tdl.primitives.reorientDirections(arrays[array], matrix);
    }
  }
};

/**
 * Creats tangents and normals.
 *
 * @param {!AttibArray} positionArray Positions
 * @param {!AttibArray} normalArray Normals
 * @param {!AttibArray} normalMapUVArray UVs for the normal map.
 * @param {!AttibArray} triangles The indicies of the trianlges.
 * @returns {!{tangent: {!AttribArray},
 *     binormal: {!AttribArray}}
 */
tdl.primitives.createTangentsAndBinormals = function(
    positionArray, normalArray, normalMapUVArray, triangles) {
  var math = tdl.math;
  // Maps from position, normal key to tangent and binormal matrix.
  var tangentFrames = {};

  // Rounds a vector to integer components.
  function roundVector(v) {
    return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
  }

  // Generates a key for the tangentFrames map from a position and normal
  // vector. Rounds position and normal to allow some tolerance.
  function tangentFrameKey(position, normal) {
    return roundVector(math.mulVectorScalar(position, 100)) + ',' +
        roundVector(math.mulVectorScalar(normal, 100));
  }

  // Accumulates into the tangent and binormal matrix at the approximate
  // position and normal.
  function addTangentFrame(position, normal, tangent, binormal) {
    var key = tangentFrameKey(position, normal);
    var frame = tangentFrames[key];
    if (!frame) {
      frame = [[0, 0, 0], [0, 0, 0]];
    }
    frame = math.addMatrix(frame, [tangent, binormal]);
    tangentFrames[key] = frame;
  }

  // Get the tangent and binormal matrix at the approximate position and
  // normal.
  function getTangentFrame(position, normal) {
    var key = tangentFrameKey(position, normal);
    return tangentFrames[key];
  }

  var numTriangles = triangles.numElements;
  for (var triangleIndex = 0; triangleIndex < numTriangles; ++triangleIndex) {
    // Get the vertex indices, uvs and positions for the triangle.
    var vertexIndices = triangles.getElement(triangleIndex);
    var uvs = [];
    var positions = [];
    var normals = [];
    for (var i = 0; i < 3; ++i) {
      var vertexIndex = vertexIndices[i];
      uvs[i] = normalMapUVArray.getElement(vertexIndex);
      positions[i] = positionArray.getElement(vertexIndex);
      normals[i] = normalArray.getElement(vertexIndex);
    }

    // Calculate the tangent and binormal for the triangle using method
    // described in Maya documentation appendix A: tangent and binormal
    // vectors.
    var tangent = [0, 0, 0];
    var binormal = [0, 0, 0];
    for (var axis = 0; axis < 3; ++axis) {
      var edge1 = [positions[1][axis] - positions[0][axis],
                   uvs[1][0] - uvs[0][0], uvs[1][1] - uvs[0][1]];
      var edge2 = [positions[2][axis] - positions[0][axis],
                   uvs[2][0] - uvs[0][0], uvs[2][1] - uvs[0][1]];
      var edgeCross = math.normalize(math.cross(edge1, edge2));
      if (edgeCross[0] == 0) {
        edgeCross[0] = 1;
      }
      tangent[axis] = -edgeCross[1] / edgeCross[0];
      binormal[axis] = -edgeCross[2] / edgeCross[0];
    }

    // Normalize the tangent and binornmal.
    var tangentLength = math.length(tangent);
    if (tangentLength > 0.001) {
      tangent = math.mulVectorScalar(tangent, 1 / tangentLength);
    }
    var binormalLength = math.length(binormal);
    if (binormalLength > 0.001) {
      binormal = math.mulVectorScalar(binormal, 1 / binormalLength);
    }

    // Accumulate the tangent and binormal into the tangent frame map.
    for (var i = 0; i < 3; ++i) {
      addTangentFrame(positions[i], normals[i], tangent, binormal);
    }
  }

  // Add the tangent and binormal streams.
  var numVertices = positionArray.numElements;
  tangents = new tdl.primitives.AttribBuffer(3, numVertices);
  binormals = new tdl.primitives.AttribBuffer(3, numVertices);

  // Extract the tangent and binormal for each vertex.
  for (var vertexIndex = 0; vertexIndex < numVertices; ++vertexIndex) {
    var position = positionArray.getElement(vertexIndex);
    var normal = normalArray.getElement(vertexIndex);
    var frame = getTangentFrame(position, normal);

    // Orthonormalize the tangent with respect to the normal.
    var tangent = frame[0];
    tangent = math.subVector(
        tangent, math.mulVectorScalar(normal, math.dot(normal, tangent)));
    var tangentLength = math.length(tangent);
    if (tangentLength > 0.001) {
      tangent = math.mulVectorScalar(tangent, 1 / tangentLength);
    }

    // Orthonormalize the binormal with respect to the normal and the tangent.
    var binormal = frame[1];
    binormal = math.subVector(
        binormal, math.mulVectorScalar(tangent, math.dot(tangent, binormal)));
    binormal = math.subVector(
        binormal, math.mulVectorScalar(normal, math.dot(normal, binormal)));
    var binormalLength = math.length(binormal);
    if (binormalLength > 0.001) {
      binormal = math.mulVectorScalar(binormal, 1 / binormalLength);
    }

    tangents.push(tangent);
    binormals.push(binormal);
  }

  return {
    tangent: tangents,
    binormal: binormals};
};

/**
 * Creates sphere vertices.
 * The created sphere has position, normal and uv streams.
 *
 * @param {number} radius radius of the sphere.
 * @param {number} subdivisionsAxis number of steps around the sphere.
 * @param {number} subdivisionsHeight number of vertically on the sphere.
 * @param {number} opt_startLatitudeInRadians where to start the
 *     top of the sphere. Default = 0.
 * @param {number} opt_endLatitudeInRadians Where to end the
 *     bottom of the sphere. Default = Math.PI.
 * @param {number} opt_startLongitudeInRadians where to start
 *     wrapping the sphere. Default = 0.
 * @param {number} opt_endLongitudeInRadians where to end
 *     wrapping the sphere. Default = 2 * Math.PI.
 */
tdl.primitives.createSphere = function(
    radius,
    subdivisionsAxis,
    subdivisionsHeight,
    opt_startLatitudeInRadians,
    opt_endLatitudeInRadians,
    opt_startLongitudeInRadians,
    opt_endLongitudeInRadians) {
  if (subdivisionsAxis <= 0 || subdivisionsHeight <= 0) {
    throw Error('subdivisionAxis and subdivisionHeight must be > 0');
  }

  opt_startLatitudeInRadians = opt_startLatitudeInRadians || 0;
  opt_endLatitudeInRadians = opt_endLatitudeInRadians || Math.PI;
  opt_startLongitudeInRadians = opt_startLongitudeInRadians || 0;
  opt_endLongitudeInRadians = opt_endLongitudeInRadians || (Math.PI * 2);

  latRange = opt_endLatitudeInRadians - opt_startLatitudeInRadians;
  longRange = opt_endLongitudeInRadians - opt_startLongitudeInRadians;

  // We are going to generate our sphere by iterating through its
  // spherical coordinates and generating 2 triangles for each quad on a
  // ring of the sphere.
  var numVertices = (subdivisionsAxis + 1) * (subdivisionsHeight + 1);
  var positions = new tdl.primitives.AttribBuffer(3, numVertices);
  var normals = new tdl.primitives.AttribBuffer(3, numVertices);
  var texCoords = new tdl.primitives.AttribBuffer(2, numVertices);

  // Generate the individual vertices in our vertex buffer.
  for (var y = 0; y <= subdivisionsHeight; y++) {
    for (var x = 0; x <= subdivisionsAxis; x++) {
      // Generate a vertex based on its spherical coordinates
      var u = x / subdivisionsAxis;
      var v = y / subdivisionsHeight;
      var theta = longRange * u;
      var phi = latRange * v;
      var sinTheta = Math.sin(theta);
      var cosTheta = Math.cos(theta);
      var sinPhi = Math.sin(phi);
      var cosPhi = Math.cos(phi);
      var ux = cosTheta * sinPhi;
      var uy = cosPhi;
      var uz = sinTheta * sinPhi;
      positions.push([radius * ux, radius * uy, radius * uz]);
      normals.push([ux, uy, uz]);
      texCoords.push([u, v]);
    }
  }

  var numVertsAround = subdivisionsAxis + 1;
  var indices = new tdl.primitives.AttribBuffer(
      3, subdivisionsAxis * subdivisionsHeight * 2, 'Uint16Array');
  for (var x = 0; x < subdivisionsAxis; x++) {
    for (var y = 0; y < subdivisionsHeight; y++) {
      // Make triangle 1 of quad.
      indices.push([
          (y + 0) * numVertsAround + x,
          (y + 0) * numVertsAround + x + 1,
          (y + 1) * numVertsAround + x]);

      // Make triangle 2 of quad.
      indices.push([
          (y + 1) * numVertsAround + x,
          (y + 0) * numVertsAround + x + 1,
          (y + 1) * numVertsAround + x + 1]);
    }
  }

  return {
    position: positions,
    normal: normals,
    texCoord: texCoords,
    indices: indices};
};

tdl.primitives.createBumpmapSphere = function(
    radius,
    subdivisionsAxis,
    subdivisionsHeight,
    opt_startLatitudeInRadians,
    opt_endLatitudeInRadians,
    opt_startLongitudeInRadians,
    opt_endLongitudeInRadians) {
  var arrays = tdl.primitives.createSphere(
      radius,
      subdivisionsAxis,
      subdivisionsHeight,
      opt_startLatitudeInRadians,
      opt_endLatitudeInRadians,
      opt_startLongitudeInRadians,
      opt_endLongitudeInRadians);
  var bn = tdl.primitives.createTangentsAndBinormals(
      arrays.position,
      arrays.normal,
      arrays.texCoord,
      arrays.indices);
  arrays.tangent = bn.tangent;
  arrays.binormal = bn.binormal;
  return arrays;
};

/**
 * Creates XZ plane vertices.
 * The created plane has position, normal and uv streams.
 *
 * @param {number} width Width of the plane.
 * @param {number} depth Depth of the plane.
 * @param {number} subdivisionsWidth Number of steps across the plane.
 * @param {number} subdivisionsDepth Number of steps down the plane.
 * @param {!o3djs.math.Matrix4} opt_matrix A matrix by which to multiply
 *     all the vertices.
 * @return {!o3djs.primitives.VertexInfo} The created plane vertices.
 */
tdl.primitives.createPlane = function(
    width,
    depth,
    subdivisionsWidth,
    subdivisionsDepth) {
  if (subdivisionsWidth <= 0 || subdivisionsDepth <= 0) {
    throw Error('subdivisionWidth and subdivisionDepth must be > 0');
  }

  // We are going to generate our sphere by iterating through its
  // spherical coordinates and generating 2 triangles for each quad on a
  // ring of the sphere.
  var numVertices = (subdivisionsWidth + 1) * (subdivisionsDepth + 1);
  var positions = new tdl.primitives.AttribBuffer(3, numVertices);
  var normals = new tdl.primitives.AttribBuffer(3, numVertices);
  var texCoords = new tdl.primitives.AttribBuffer(2, numVertices);

  // Generate the individual vertices in our vertex buffer.
  for (var z = 0; z <= subdivisionsDepth; z++) {
    for (var x = 0; x <= subdivisionsWidth; x++) {
      // Generate a vertex based on its spherical coordinates
      var u = x / subdivisionsWidth;
      var v = z / subdivisionsDepth;
      positions.push([
          width * u - width * 0.5,
          0,
          depth * v - depth * 0.5]);
      normals.push([0, 1, 0]);
      texCoords.push([u, v]);
    }
  }

  var numVertsAcross = subdivisionsWidth + 1;
  var indices = new tdl.primitives.AttribBuffer(
      3, subdivisionsWidth * subdivisionsDepth * 2, 'Uint16Array');

  for (var z = 0; z < subdivisionsDepth; z++) {
    for (var x = 0; x < subdivisionsWidth; x++) {
      // Make triangle 1 of quad.
      indices.push([
          (z + 0) * numVertsAcross + x,
          (z + 1) * numVertsAcross + x,
          (z + 0) * numVertsAcross + x + 1]);

      // Make triangle 2 of quad.
      indices.push([
          (z + 1) * numVertsAcross + x,
          (z + 1) * numVertsAcross + x + 1,
          (z + 0) * numVertsAcross + x + 1]);
    }
  }

  return {
    position: positions,
    normal: normals,
    texCoord: texCoords,
    indices: indices};
};
