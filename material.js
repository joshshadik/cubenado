"use strict";
class Material {
    constructor(vertexShader, fragmentShader) 
    {     
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);
        gl.linkProgram(this.shaderProgram);
        
        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) 
        {
            alert("Unable to initialize the shader program: " + gl.getProgramInfoLog(shader));
        }
        
        this.textureAttributes = [];
        this.floatAttributes = [];
        this.vertexAttributes = [];
        this.matrixAttributes = [];
    }
    
    setTexture(texName, texValue ) 
    {
        this.textureAttributes[texName] = texValue;
    }
    
    setFloat( floatName, floatValue ) 
    {
        this.floatAttributes[floatName] = floatValue;
    }
    
    setMatrix( matName, matValue ) 
    {
        this.matrixAttributes[matName] = matValue;
    }
    
    addVertexAttribute( attName ) 
    {
        var attValue = gl.getAttribLocation(this.shaderProgram, attName );
        gl.enableVertexAttribArray(attValue);
        this.vertexAttributes[attName] = attValue;
        return attValue;
    }
    
    getVertexAttribute( attName ) 
    {
        return this.vertexAttributes[attName];
    }
    
    
    apply() 
    {
        gl.useProgram(this.shaderProgram);
  
        var texCount = 0;
        for( var attName in this.textureAttributes )
        {
            gl.activeTexture(gl.TEXTURE0 + texCount);
            gl.bindTexture(gl.TEXTURE_2D, this.textureAttributes[attName]);
            gl.uniform1i(gl.getUniformLocation(this.shaderProgram, attName), texCount);   
              
            texCount++;
        }
        
        for( var attName in this.floatAttributes )
        {
            gl.uniform1f( gl.getUniformLocation(this.shaderProgram, attName), this.floatAttributes[attName] );           
        }
        
        for( var attName in this.matrixAttributes )
        {
            gl.uniformMatrix4fv( gl.getUniformLocation( this.shaderProgram, attName ), false, this.matrixAttributes[attName] );
        }
        
        
        for( var attName in this.vertexAttributes )
        {
            gl.enableVertexAttribArray( this.vertexAttributes[attName] );
        }

    }
    
}