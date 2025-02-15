0. Create your own branch
0a. `git branch <new_branch_name>`
0aa. `git checkout <new_branch_name>`
0b. Make an edit to this file. 
0c. Add and commit the change on the `Source Control` tab. 

1. `cd my-app/`
2. `npm install`
3. Create a file for each page under the folder `screens`.
1a. You can copy and paste the contents of `first.js` 
1b. On the line 5 (`const HomeScreen = ({ navigation }) => {`) and line 31 (`export default HomeScreen`)  change `HomeScreen` to something else (perhaps the name of your new screen)

4. Import your new screen into `App.js`
2a. Take a note of how it is done for `first.js` on line 3 - `import HomeScreen from './screens/first'`. Just replace `HomeScreen` and `first` with the relevant names from your screen.

5. Add your screen to the navigation stack. 
3a. There is a currently disabled example on line 15 of `App.js` - `{/* <Stack.Screen name="Details" component={DetailsScreen} />`
3b. Change line 15 to be relevant names - `"Details"` is your choice, pick something relevant. `DetailsScreen` should be replaced with whatever you imported in step 2a.
3c. Uncomment the line to activate (by default, click the line and press `Ctrl + /`)

6. Make it the screen to be displayed
4a. One line 13, replace the `Home` in `initialRouteName="Home">` with whatever you specified as the as the name in step 3b.
4b. It should appear on your screen.
