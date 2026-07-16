#WingletReader

## Library Facelift - Target Rework

### Issues/ Requirements

- gut target functionality entirely; but leave its basic ui elements in place
  
- new category should lead before content/ chapters; 'bookmarks'
  
- Bookmarks conceptually are marked points inside the text, between which the user can choose to insert into the text from (shortcuts so to speak)
  
- from the library the user can edit and remove the bookmarks
  
- the reader tile (originally set targets') allows the following functionalities; set bookmark at current position, set bookmark at the selected position, browse selected bookmarks.
  

### Bookmarks

Normal

- marks passage in text from which you want to save as a starting position or a reference position. Lives across sessions. Serves as a trageted insertion mechanism
  
- user has 1....n bookmarks for m texts
  

Goal

- marks specific text passage, where the reader intends to stop their reading session. Lives across sessions, user has exactly one goal bookmark per text
  
- the goal bookmark must be ahead of the current saved position in the text
  
- once a user traverses the goal bookmark; the playback stops and the user should be notified (optional for now)
  
- once a goalmark is reached, the goal bookmark terminates itself, making room for a new goal bookmark to be created by the user