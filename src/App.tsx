// App.js
import React from "react";
import { ReactP5Wrapper } from "@p5-wrapper/react";
import sketch from "./MazeEscapeSketch";
//Audio
import bounce from "./assets/audio/bounce.wav";
import complete from "./assets/audio/complete.wav";
import crash from "./assets/audio/crash.wav";
import gameover from "./assets/audio/gameover.wav";

export function App() {
  return (
    <>
      <ReactP5Wrapper sketch={sketch} />
      <audio id="audio-bounce" className="hidden" src={bounce}></audio>
      <audio id="audio-complete" className="hidden" src={complete}></audio>
      <audio id="audio-crash" className="hidden" src={crash}></audio>
      <audio id="audio-gameover" className="hidden" src={gameover}></audio>
    </>
  );
}
