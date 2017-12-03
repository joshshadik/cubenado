var canvas;
var gl;

var cubeVerticesBuffers = [];
var cubeVerticesIndexBuffer;

var bufferCount;

var particleMaterials = [];
var particleMaterialIndex = 0;

var frameVerticesBuffer;
var frameIndexBuffer;

// Using multiple framebuffers since can't use multiple color attachments without extensions or webgl2
var rtPosBuffer;
var rtVelBuffer;
var rtCopyBuffer;

var rtPosTexture;
var rtVelTexture;
var rtCopyTexture;

var posDataProgram;
var velDataProgram;
var rtCopyProgram;

var posDataMaterial;
var velDataMaterial;
var copyMaterial;

var lastUpdateTime = 0;

var particleCount = 1000;

var timeScale = 1.0;


// support for up to RT_TEX_SIZE * RT_TEX_SIZE number of particles
// 128x128 = 16384 particles
const RT_TEX_SIZE = 128;

// Maximum number of cubes in a buffer
// for 36 tri indices in 16-bit array : 1820*36 < 2^16
const MAX_PER_BUFFER = 1820;

//
// start
//
// called when body loads
// sets everything up
//
function start() {
    canvas = document.getElementById("glcanvas");

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    
    initWebGL(canvas);

    // only continue if webgl is working properly
    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
        gl.clearDepth(1.0);                 // Clear everything
        gl.enable(gl.DEPTH_TEST);           // Enable depth testing
        gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

        gl.disable(gl.BLEND);

        initBuffers();  
        initParticleData();      
        initMaterials();
        initUI();
        
        // start the core loop cycle
        requestAnimationFrame(tick);     
    }
}

//
// initWebGL
//
// initialize WebGL, returning the GL context or null if
// WebGL isn't available or could not be initialized.
//
function initWebGL() {
    gl = null;

    try {
        gl = canvas.getContext("experimental-webgl", { alpha: false });
    }
    catch(e) {
    }

    // If we don't have a GL context, give up now

    if (!gl) {
        alert("Unable to initialize WebGL. Your browser may not support it.");
    }
}


//
// initBuffers
//
// creates batched buffers to hold
// maximum number of cubes
//
function initBuffers() 
{
    //maxium particles that can be represented in the textures
    var maxparticleCount = RT_TEX_SIZE * RT_TEX_SIZE;
  
    bufferCount = Math.ceil( maxparticleCount / MAX_PER_BUFFER );
  
    cubeVerticesBuffers.length = bufferCount;
  
    var gridSize = Math.ceil( Math.sqrt( maxparticleCount ) );
  
    for( var b = 0; b < bufferCount; b++ )
    {
        cubeVerticesBuffers[b] = gl.createBuffer();
    
        // setup batched vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffers[b]);
    
        var batchedVertices = [];
        batchedVertices.length = vertices.length * Math.min( MAX_PER_BUFFER, maxparticleCount - b * MAX_PER_BUFFER );
    
        // each cube in buffer will be spaced out on xz grid - so shader can differentiate between them
        for(var i=0; i < batchedVertices.length; i+=3 )
        {
            var index = i % vertices.length;
            var pos = vertices.slice(index,index + 3);
      
            // index of cube out of all cubes through all buffers
            var cubedex = Math.floor( ( i + b * MAX_PER_BUFFER * vertices.length ) / vertices.length );
      
            pos[0] = pos[0] + ( cubedex % gridSize ) * 3;
            pos[2] = pos[2] + Math.floor( cubedex / gridSize ) * 3;
      
            batchedVertices[i] = pos[0];
            batchedVertices[i+1] = pos[1];
            batchedVertices[i+2] = pos[2];
        }

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedVertices), gl.STATIC_DRAW);
    }
      

    cubeVerticesIndexBuffer = gl.createBuffer();    
      
    // setup batched elements
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);


    var batchedElements = [];
    batchedElements.length = cubeVertexIndices.length * MAX_PER_BUFFER;
  
    for( var i=0; i < batchedElements.length; i++ )
    {
        var index = i % cubeVertexIndices.length;
    
        // index of cube out of cubes in this current buffer
        var cubedex = Math.floor( i / cubeVertexIndices.length );
    
        batchedElements[i] = cubeVertexIndices[index] + cubedex * vertices.length / 3; // 8 vertex points in a cube - aka ( vertices / 3 )
    }

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(batchedElements), gl.STATIC_DRAW);
}


//
// initParticleData
//
// initializes framebuffers, render textures, and materials
// used for keep track of particle positions & velocities
//
function initParticleData() 
{
  
    // need either floating point, or half floating point precision for holding position and velocity data
    var ext = gl.getExtension("OES_texture_float");
    var texelData = gl.UNSIGNED_BYTE;
  
    if( ext != null )
    {
        texelData = gl.FLOAT;
    }
    else
    {
        ext = gl.getExtension("OES_texture_half_float");
        if( ext != null )
        {
            texelData = ext.HALF_FLOAT_OES;
        }
        else
        {
            alert("Device & browser needs to support floating point or half floating point textures in order to work properly");
        }
    }
    
    // setup framebuffer to render particle postiions & lifetime into texture : rgb = xyz, a = lifetime
    rtPosBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtPosBuffer);
  
    rtPosBuffer.width = RT_TEX_SIZE;
    rtPosBuffer.height = RT_TEX_SIZE;
  
    rtPosTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtPosTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RT_TEX_SIZE, RT_TEX_SIZE, 0, gl.RGBA, texelData, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtPosTexture, 0);
  
  
    // setup framebuffer to render particle velocities into texture : rgb = xyz, a = random seed
    rtVelBuffer  = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtVelBuffer);
  
    rtVelBuffer.width = RT_TEX_SIZE;
    rtVelBuffer.height = RT_TEX_SIZE;
  
    rtVelTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtVelTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RT_TEX_SIZE, RT_TEX_SIZE, 0, gl.RGBA, texelData, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtVelTexture, 0);


    // setup framebuffer as intermediate - to copy contents into position & velocity textures
    rtCopyBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtCopyBuffer);
  
    rtCopyBuffer.width = RT_TEX_SIZE;
    rtCopyBuffer.height = RT_TEX_SIZE;
  
    rtCopyTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rtCopyTexture );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RT_TEX_SIZE, RT_TEX_SIZE, 0, gl.RGBA, texelData, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtCopyTexture, 0);
  

    // create buffers for rendering images on quads
    frameVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);
  
    frameIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(quadVertexIndices), gl.STATIC_DRAW);
  
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    
    // setup data materials
    var quadVS = getShader(gl, "screenquad-vs");
    var posFS = getShader(gl, "position-fs");
    var velFS = getShader(gl, "velocity-fs");
    var copyFS = getShader(gl, "copy-fs");
    
    // material to update position
    posDataMaterial = new Material(quadVS, posFS);   
    posDataMaterial.setTexture("uPosTex", rtPosTexture );
    posDataMaterial.setTexture("uVelTex", rtVelTexture );
    posDataMaterial.addVertexAttribute("aVertexPosition");
    
    // material to update velocity
    velDataMaterial = new Material(quadVS, velFS);   
    velDataMaterial.setTexture("uPosTex", rtPosTexture );
    velDataMaterial.setTexture("uVelTex", rtVelTexture );
    velDataMaterial.addVertexAttribute("aVertexPosition");
    
    // material to copy 1 texture into another
    copyMaterial = new Material(quadVS, copyFS);   
    copyMaterial.setTexture("uCopyTex", rtCopyTexture );
    copyMaterial.addVertexAttribute("aVertexPosition");
    
    
    // initialize data into position and velocity textures - random start lifetimes & seeds
    var initPosFS = getShader(gl, "initdata-fs");
    var initDataMaterial = new Material( quadVS, initPosFS );
    initDataMaterial.addVertexAttribute("aVertexPosition");
    
    gl.viewport(0, 0, RT_TEX_SIZE, RT_TEX_SIZE);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
    renderDataBuffer( rtPosBuffer, initDataMaterial );
    renderDataBuffer( rtVelBuffer, initDataMaterial );
}

//
// initMaterials
//
// Initializes materials for cubes
//
function initMaterials() 
{
    particleMaterials.length = 3;
        
    var litoutlineFS = getShader(gl, "litoutline-fs");
    var litoutlineVS = getShader(gl, "litoutline-vs");   
    
    var basicVS = getShader(gl, "basic-vs" );
    
    var cubeframeFS = getShader(gl, "cubeframe-fs" );
    var cornercolorFS = getShader(gl, "cornercolor-fs" );

    particleMaterials[0] = new Material( litoutlineVS, litoutlineFS );
    particleMaterials[1] = new Material( basicVS, cubeframeFS );
    particleMaterials[2] = new Material( basicVS, cornercolorFS );

    
    perspectiveMatrix = makePerspective(45, canvas.width/canvas.height, 0.1, 1000.0);

    for( var i=0; i < particleMaterials.length; i++ )
    {
        particleMaterials[i].setTexture("uPosTex", rtPosTexture );
        particleMaterials[i].addVertexAttribute("aVertexPosition");
        particleMaterials[i].setMatrix("uPMatrix", new Float32Array( perspectiveMatrix ) );
        particleMaterials[i].setMatrix("uMVMatrix", new Float32Array( mvMatrix ) );
        particleMaterials[i].setMatrix("uNormalMatrix", new Float32Array( normalMatrix ) );
    }
}

//
// initUI
//
// sets up ui sliders
//
function initUI()
{
    var cubeSlider = document.getElementById("cubeSlider");
    var cubeText = document.getElementById("cubeCount");
   
    cubeSlider.onchange = function() {
      var sliderValue = parseInt(cubeSlider.value) * 0.01;
      sliderValue = sliderValue * sliderValue;
      particleCount = Math.floor( sliderValue * 9990 + 10);
      cubeText.innerText = particleCount;
    };
    
    cubeSlider.onchange();
    
    
    var randomSlider = document.getElementById("randomSlider");
    var randomText = document.getElementById("randomness");
    
    randomSlider.onchange = function() {
        var value = parseInt( randomSlider.value ) * 0.01;
        var randomness = value;
        randomText.innerText = randomSlider.value + "%";
        
        velDataMaterial.setFloat("uRandomness", randomness );
    }
    
    randomSlider.onchange();
    
    
    var gravitySlider = document.getElementById("gravitySlider");
    var gravityText = document.getElementById("gravity");
    
    gravitySlider.onchange = function() {
        var value = parseInt( gravitySlider.value );
        var gravity = value;
        gravityText.innerHTML = "-" + gravity + "m/s<sup>2</sup>";
        
        velDataMaterial.setFloat("uGravityScale", gravity );
    }
    
    gravitySlider.onchange();
    
    
    var timeSlider = document.getElementById("timeSlider");
    var timeText = document.getElementById("timeScale");
    
    timeSlider.onchange = function() {
        timeScale = parseInt( timeSlider.value ) * 0.01;
        timeText.innerText = Math.floor( timeScale * 100.0 ) + "%";
    }
    
    timeSlider.onchange();
    
    
    var shaderButton = document.getElementById("shaderButton");
    
    shaderButton.onclick = function() {
        particleMaterialIndex = ( particleMaterialIndex + 1 ) % particleMaterials.length;
    }
}

//
// renderDataBuffer
//
// takes a framebuffer and material
// renders a quad with the dataMaterial into the dataBuffer
// using a buffer inbetween so it can use it's previous frame texture as data
//
function renderDataBuffer( dataBuffer, dataMaterial )
{
    // setup quad geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, frameVerticesBuffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);  
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIndexBuffer);
    
    
    // render data into copy texture
    gl.bindFramebuffer( gl.FRAMEBUFFER, rtCopyBuffer );
    gl.clear( gl.COLOR_BUFFER_BIT );
    
    dataMaterial.apply();
        
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    
    
    // render copy texture into data texture
    gl.bindFramebuffer( gl.FRAMEBUFFER, dataBuffer );
    gl.clear( gl.COLOR_BUFFER_BIT );
  
    copyMaterial.apply();
    
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  
}

//
// renderParticleData
//
// Renders updates into the particle position & velocity data textures 
//
function renderParticleData(deltaTime) 
{
    gl.viewport(0, 0, RT_TEX_SIZE, RT_TEX_SIZE);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    
    velDataMaterial.setFloat("uDeltaTime", deltaTime );  
    posDataMaterial.setFloat("uDeltaTime", deltaTime );
    
    renderDataBuffer( rtVelBuffer, velDataMaterial );
    renderDataBuffer( rtPosBuffer, posDataMaterial );
    
    //renderDataBuffer( null, posDataMaterial );
  
    // reset framebuffer to screen
    gl.bindFramebuffer( gl.FRAMEBUFFER, null ); 
    gl.viewport(0, 0, canvas.width, canvas.height);
}

//
// render
//
// Draw the scene.
//
function render( deltaTime ) 
{ 
    renderParticleData( deltaTime );
  
    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

 
    particleMaterials[particleMaterialIndex].apply();

    for( var b=0; b < bufferCount; b++ )
    {
        if( particleCount < b * MAX_PER_BUFFER )
        {
            break;
        }
    
        // Bind all cube vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffers[b]);
        gl.vertexAttribPointer(particleMaterials[particleMaterialIndex].getVertexAttribute("aVertexPosition"), 3, gl.FLOAT, false, 0, 0);

    
        var elementCount = Math.min( particleCount - b * MAX_PER_BUFFER, MAX_PER_BUFFER );
    
        // Draw the cubes.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
        gl.drawElements(gl.TRIANGLES, 36 * elementCount, gl.UNSIGNED_SHORT, 0);
    }
}

// 
// tick
//
// core loop function
// called every frame, updates & tells the scene to render
//
function tick( currentTime )
{
    var deltaTime = 0;
    if (lastUpdateTime) 
    {
        deltaTime = ( currentTime - lastUpdateTime ) * 0.001 * timeScale; // in seconds
        
        // prevent large animation jump from switching tabs/minimizing window
        if( deltaTime > 1.0 )
        {
            deltaTime = 0.0;
        }
            
    }
    lastUpdateTime = currentTime;
    
    velDataMaterial.setFloat("uTime", currentTime );
    
    resize();
    
    render( deltaTime );
    
    
    requestAnimationFrame( tick );
}

//
// getShader
//
// loads a shader program by scouring the current document,
// looking for a script with the specified ID.
//
function getShader(gl, id) 
{
    var shaderScript = document.getElementById(id);

    // Didn't find an element with the specified ID; abort.
    if (!shaderScript) {
        return null;
    }

    // Walk through the source element's children, building the shader source string
    var theSource = "";
    var currentChild = shaderScript.firstChild;

    while(currentChild) {
        if (currentChild.nodeType == 3) {
            theSource += currentChild.textContent;
        }

        currentChild = currentChild.nextSibling;
    }

    // Now figure out what type of shader script we have, based on its MIME type.
    var shader;

    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;  // Unknown shader type
    }

    gl.shaderSource(shader, theSource);

    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function resize() 
{

  var displayWidth  = window.innerWidth;
  var displayHeight = window.innerHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;

    perspectiveMatrix = makePerspective(45, canvas.width/canvas.height, 0.1, 1000.0);
    
    for( var i=0; i < particleMaterials.length; i++ )
    {
        particleMaterials[i].setMatrix("uPMatrix", perspectiveMatrix );
    }
    
    // Set the viewport to match
    gl.viewport(0, 0, canvas.width,canvas.height);
  }
}


var vertices = [
  -0.7, -0.7,  0.7,
    0.7, -0.7,  0.7,
    0.7,  0.7,  0.7,
  -0.7,  0.7,  0.7,

  -0.7, -0.7, -0.7,
  -0.7,  0.7, -0.7,
    0.7,  0.7, -0.7,
    0.7, -0.7, -0.7
];

var vertexNormals = [
  -0.57735, -0.57735,  0.57735,
    0.57735, -0.57735,  0.57735,
    0.57735,  0.57735,  0.57735,
  -0.57735,  0.57735,  0.57735,

  -0.57735, -0.57735, -0.57735,
  -0.57735,  0.57735, -0.57735,
    0.57735,  0.57735, -0.57735,
    0.57735, -0.57735, -0.57735

];

var textureCoordinates = [
  0.0,  0.0,
  1.0,  0.0,
  1.0,  1.0,
  0.0,  1.0,

  0.0,  0.0,
  1.0,  0.0,
  1.0,  1.0,
  0.0,  1.0

];

var cubeVertexIndices = [
    0,  1,  2,      0,  2,  3,    // front
    4,  5,  6,      4,  6,  7,    // back
    5,  3,  2,      5,  2,  6,   // top
    4,  7,  1,      4,  1,  0,   // bottom
    7,  6,  2,      7,  2,  1,   // right
    4,  0,  3,      4,  3,  5    // left
];

var quadVertices = [
  -1.0, -1.0,  -1.0,
    1.0, -1.0,  -1.0,
    1.0,  1.0,  -1.0,
  -1.0,  1.0,  -1.0,
];

var quadVertexIndices = [
    0,  1,  2,      
    0,  2,  3
];

var normalMatrix = [
    1, 0, 0, 0, 
    0, 1, 0, 20, 
    0, 0, 1, 100, 
    0, 0, 0, 1
];

var mvMatrix = [
    1, 0, 0, 0, 
    0, 1, 0, 0, 
    0, 0, 1, 0, 
    0, -20, -100, 1
];

var perspectiveMatrix = [
    1.8106601717, 0, 0, 0, 
    0, 2.4142135623, 0, 0, 
    0, 0, -1.000200020, -1, 
    0, 0, -0.200020002, 0
];


function makePerspective(fovy, aspect, znear, zfar)
{
    var ymax = znear * Math.tan(fovy * Math.PI / 360.0);
    var ymin = -ymax;
    var xmin = ymin * aspect;
    var xmax = ymax * aspect;

    return makeFrustum(xmin, xmax, ymin, ymax, znear, zfar);
}


function makeFrustum(left, right,
                     bottom, top,
                     znear, zfar)
{
    var X = 2*znear/(right-left);
    var Y = 2*znear/(top-bottom);
    var A = (right+left)/(right-left);
    var B = (top+bottom)/(top-bottom);
    var C = -(zfar+znear)/(zfar-znear);
    var D = -2*zfar*znear/(zfar-znear);

    return [X, 0, 0, 0,
            0, Y, 0, 0,
            A, B, C, -1,
            0, 0, D, 0];

}