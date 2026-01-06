let showWhiteBackground = false;

function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  // Transparent background
  if (showWhiteBackground) {
    background(80);
  } else {
    clear();
  }

  let cx = width / 2;
  let cy = height / 2;

  // Lumio palette - 3 colors
  let amber = color(255, 167, 38);
  let coral = color(255, 112, 97);
  let violet = color(156, 104, 212);

  noStroke();

  // White circle background (toggle with 'b' key)
  if (showWhiteBackground) {
    fill(255);
    ellipse(cx, cy, 380, 380);
  }

  // === SINGLE DOCUMENT WITH 3 COLORS ===
  let docWidth = 160;
  let docHeight = 200;
  let cornerFold = 40;

  // Main document body (violet)
  fill(violet);
  beginShape();
  vertex(cx - docWidth/2, cy - docHeight/2);
  vertex(cx + docWidth/2 - cornerFold, cy - docHeight/2);
  vertex(cx + docWidth/2, cy - docHeight/2 + cornerFold);
  vertex(cx + docWidth/2, cy + docHeight/2);
  vertex(cx - docWidth/2, cy + docHeight/2);
  endShape(CLOSE);

  // Corner fold (coral)
  fill(coral);
  beginShape();
  vertex(cx + docWidth/2 - cornerFold, cy - docHeight/2);
  vertex(cx + docWidth/2 - cornerFold, cy - docHeight/2 + cornerFold);
  vertex(cx + docWidth/2, cy - docHeight/2 + cornerFold);
  endShape(CLOSE);

  // Amber accent - circular seal/badge at bottom right
  fill(amber);
  let sealX = cx + docWidth/2 - 35;
  let sealY = cy + docHeight/2 - 35;
  let sealRadius = 28;
  ellipse(sealX, sealY, sealRadius * 2, sealRadius * 2);

  // Inner circle detail on seal
  fill(255, 80);
  ellipse(sealX, sealY, sealRadius * 1.2, sealRadius * 1.2);

  // Document lines (white, subtle)
  stroke(255, 150);
  strokeWeight(4);
  strokeCap(ROUND);

  let lineStartX = cx - docWidth/2 + 25;
  let lineEndX = cx + docWidth/2 - 25;
  let lineY = cy - docHeight/2 + 60;
  let lineSpacing = 24;

  // Text lines
  for (let i = 0; i < 4; i++) {
    let endX = (i === 3) ? lineStartX + (lineEndX - lineStartX) * 0.5 : lineEndX;
    line(lineStartX, lineY + i * lineSpacing, endX, lineY + i * lineSpacing);
  }

  noStroke();

  // Signature line
  stroke(40);
  strokeWeight(6);
  strokeCap(ROUND);
  line(100, 330, 300, 330);
}

function keyPressed() {
  if (key === 'b' || key === 'B') {
    showWhiteBackground = !showWhiteBackground;
    redraw();
  }
}
