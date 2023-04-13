mkdir env

cd ./env

echo "Installing yarn"
npm install yarn -g

echo "Cloning VM"
git clone --depth 1 https://github.com/llk/scratch-vm.git

echo "Cloning GUI"
git clone --depth 1 https://github.com/llk/scratch-gui.git

echo "Preparing VM"
cd scratch-vm
yarn install
yarn link

echo "Preparing GUI"
cd ../scratch-gui
yarn link scratch-vm
yarn install

cd ../..

echo "Please copy the contents of this folder (except for /env) into /env, windows style"