# WingletReader

## Playback Loop

### Issues/ Redesign Proposal

The Rework should adress the following functionalities:

- The Stop Functionality
  
- The Goal Functionality
  

## Stop Functionality (Issues)

- Currently, if a user presses stop, the text completely finishes, resetting the saved progress back to the beginning; this is an option that wouldnt be used much if this is all it does, and frankly shouldnt even be an option.
  
- The Stop functionality should only target the session; so triggering a stop resets the session but keeps the progress of the recent guarded, so that a stop doesent reset the entire progress of the book, but only the reading sessions'
  
- Additionally currently the functionality is bound to one single action: stop the text, with no follow up action after, although there would be merit to it
  

## Goal Functionality (Issues)

- Same as above automatically stops without follow up action, with the only difference being the option to continue which is good and can stay as is
  
- skipping across a set goal just continues the text. The word goal should be seen as a terminal point, any text located behind it auto terminates and reverts back to the goal as the new intial starting point
  

### Problem Statement

- Currently, each of the options do not offer a clear guidance for the reader for follow up actions, thus making the process choppy and less intuitive. Each option that would trail either a stop or a reached goal is hidden away in the ui. Without any steering or guidance a user could become frustrated very quick, because of the necessary thought that would need to flow in otherwise intuitive actions
  

# Solution:

### Shared:

- Each function after being triggered opens a centered pop up window in the reader window. This window is centered and provides the user with the follow up options that they can execute. This winow follows the same design as the rest of the ui kit and should reroute existing settings in an additional interface
  
- triggering an exit option automatically transfers the user to the library tab, not the hub
  

### Stop Options:

- Soft exit option that preserves the current progress state in case the user wants to preserve it and simply terminate the session (Save and Exit)
  
- Hard Exit option that discards the session progress entirely (Exit without saving)
  
- An Abort option in case of a missclick
  
- on click if the reader is running it is paused
  

### Goal Options:

- Set a new Goal (retriggers the Target creation flow)
  
- continue reading (starts text in the position where the goal was reached with the reader paused)
  
- both soft and hard exit options
  

## Design Approach

- Tactile, interactive but should be a standalone interface as far as possible, with rerouting only with the more complex options that would cause it to bloat (setting a new goal for example)
  
- Should match the Ui style of the rest of the reader desing system
  
- Should be intuitive to navigate and sorted with ascending importance
  
- The options themsevles ought to be color coded as well
  

## Visual Appearance:

- should extend below the WingletReader display, moving it up a bit to make space where need be, for that space drop the text field and only preserve the progress as necessary value to show but just include this metric in the interface.
  
- Shouldnt be broader than the Playbackbuttons below and shouldt be too long either, with just minal vertical displacement of the WingletReaderlogo allowed (exception if the viewport is too small to render them both without complications)
  
- should be in place and should not move at all (static rectangular/squared display box)