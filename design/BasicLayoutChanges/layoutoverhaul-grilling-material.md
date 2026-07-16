# WingletReader

## Layout Restructure

### Description

The current implementation of the Navigation system leaves a couple of discrepancies that could be confusing to some users and significantly impair efficient movement within the app itself. I will list layout changes, sorted by their importance and collated by the feature their contained in:

## Core

### Reader Navigation

- currently the Reader is wired in a way, so that pressing the red arrow navigates towards the hub, this can stay as is
  
- The library button is pleaced very awkwardly above the progress bar and relatively hidden -> It should be in the bottom left, in horizontal alignment with the back button and vertical alignment with the playback buttons. The button should be squared and about the dimension of the play button
  

### Library

- currently, to jump into the text directly, the user must click the title; this navigation option is not intuitive at all; instead the resume button should get its own segment on the library card
  
- Inside a text card, the return to library option is above the book name, suqished to be in line. Drop that button and use the already wired home button and turn it into a back button to move up one layer just as implemented in the settings tab. Use the same asset as the settings do.
  

### Overlay Reader

- returning back from the overlay reader, when having navigated to it from the hub returns back to the settings main hub. This should be rewired to be 2 seperate routes; from settings returns to settings, from hub returns to hub